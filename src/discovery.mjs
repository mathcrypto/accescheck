import { assess, criteria, safeAccesLibre, safeDoctolib, safeWebsite } from './core.mjs';
import { createPracticeStore } from './practice-store.mjs';

export const criterionKeys = Object.keys(criteria);
export function coordinates(value) {
  if (
    !value ||
    !Number.isFinite(value.latitude) ||
    !Number.isFinite(value.longitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    value.longitude < -180 ||
    value.longitude > 180
  )
    return null;
  return { latitude: value.latitude, longitude: value.longitude };
}

export function distanceKm(a, b) {
  if (!coordinates(a) || !coordinates(b)) return null;
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const latitude = rad(b.latitude - a.latitude);
  const longitude = rad(b.longitude - a.longitude);
  const h =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function validateRequirements(value) {
  if (
    !value ||
    !Array.isArray(value.keys) ||
    value.keys.length > criterionKeys.length ||
    value.keys.some((key) => !criterionKeys.includes(key)) ||
    new Set(value.keys).size !== value.keys.length ||
    (value.minWidth !== null &&
      (!Number.isFinite(value.minWidth) || value.minWidth < 40 || value.minWidth > 200))
  )
    throw new Error('Critères de recherche invalides.');
  return { keys: value.keys, minWidth: value.minWidth };
}

function plainLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function geocodeScore(feature, query) {
  const properties = feature.properties || {};
  const q = plainLabel(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  const city = plainLabel(properties.city);
  const name = plainLabel(properties.name);
  const label = plainLabel(properties.label);
  const postcode = String(properties.postcode || '');
  let score = 0;
  if (properties.type === 'municipality' && (city === q || name === q)) score += 100;
  else if (properties.type === 'municipality' && (city.startsWith(q) || name.startsWith(q)))
    score += 80;
  if (city === q || name === q) score += 40;
  if (label === q || label.startsWith(q + ' ')) score += 20;
  if (properties.type === 'street' && label.includes(q)) score += 5;
  // « bastille paris »: every token should appear; do not collapse to the city alone.
  if (tokens.length >= 2) {
    const hits = tokens.filter(
      (token) => label.includes(token) || name.includes(token) || city.includes(token),
    ).length;
    score += hits * 35;
    if (
      properties.type === 'municipality' &&
      tokens.some((token) => token !== city && token !== name && !name.includes(token))
    ) {
      score -= 120;
    }
  }
  // Prefer major urban centres when several streets share the same name.
  if (/^75/.test(postcode)) score += 30;
  else if (/^(69|13|31|33|59|44|67|34|38|06)/.test(postcode)) score += 12;
  return score;
}

async function fetchGeocodeFeatures(query, transport, type) {
  const url = new URL('https://data.geopf.fr/geocodage/search');
  const params = {
    q: query,
    index: 'address',
    limit: '5',
    autocomplete: '0',
  };
  if (type) params.type = type;
  url.search = new URLSearchParams(params);
  const response = await transport(url.href, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('La recherche d’adresse IGN est indisponible.');
  const data = await response.json();
  return data.features || [];
}

export async function geocode(query, transport = fetch) {
  if (typeof query !== 'string' || query.trim().length < 3 || query.length > 200)
    throw new Error('Adresse ou quartier requis.');
  const trimmed = query.trim();
  // Only single-token queries (e.g. « Grenoble ») ask for a municipality — not « bastille paris ».
  const simple = plainLabel(trimmed).split(/\s+/).length === 1 && !/\d/.test(trimmed);
  const features = [
    ...(simple ? await fetchGeocodeFeatures(trimmed, transport, 'municipality') : []),
    ...(await fetchGeocodeFeatures(trimmed, transport)),
  ];
  const seen = new Set();
  const ranked = features
    .map((feature) => ({ feature, score: geocodeScore(feature, trimmed) }))
    .sort((a, b) => b.score - a.score)
    .flatMap(({ feature }) => {
      const [longitude, latitude] = feature.geometry?.coordinates || [];
      const point = coordinates({ latitude, longitude });
      const properties = feature.properties || {};
      const postcode = String(properties.postcode || '');
      const key = `${latitude},${longitude},${properties.label}`;
      if (!point || typeof properties.label !== 'string' || !/^\d{5}$/.test(postcode) || seen.has(key))
        return [];
      seen.add(key);
      return [
        {
          ...point,
          label: properties.label.slice(0, 250),
          source: 'IGN · Base Adresse Nationale',
          approximate: properties.type !== 'housenumber',
        },
      ];
    });
  return ranked.slice(0, 5);
}

function sourceLocation(record) {
  if (coordinates(record.location)) return coordinates(record.location);
  const source = record.sourceFields || {};
  if (
    source.latitude === null ||
    source.latitude === undefined ||
    source.longitude === null ||
    source.longitude === undefined ||
    source.latitude === '' ||
    source.longitude === ''
  )
    return null;
  return coordinates({ latitude: Number(source.latitude), longitude: Number(source.longitude) });
}

export async function findPractices(database, input) {
  if (
    !input ||
    input.confirmed !== true ||
    Object.keys(input).some(
      (key) =>
        !['confirmed', 'needs', 'specialty', 'origin', 'radiusKm', 'page', 'preferPostcodes'].includes(
          key,
        ),
    )
  )
    throw new Error('Confirmez vos critères avant la recherche.');
  const needs = validateRequirements(input.needs);
  if (!needs.keys.length) throw new Error('Sélectionnez au moins un critère.');
  const origin =
    input.origin === null || input.origin === undefined ? null : coordinates(input.origin);
  if (
    input.origin !== null &&
    input.origin !== undefined &&
    (!origin || typeof input.origin.label !== 'string' || input.origin.label.length > 250)
  )
    throw new Error('Point de départ invalide.');
  const radius = input.radiusKm ?? null;
  if (radius !== null && (!Number.isFinite(radius) || radius < 0.1 || radius > 50))
    throw new Error('Rayon de recherche invalide.');
  if (radius !== null && !origin)
    throw new Error('Choisissez un point de départ avant de limiter la distance.');
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error('Page invalide.');
  const store = createPracticeStore(database);
  const catalog = await store.catalog();
  const specialty = input.specialty || '';
  if (typeof specialty !== 'string' || (specialty && !catalog.specialties.includes(specialty)))
    throw new Error('Spécialité invalide.');
  const { records, dataset } = await store.candidates({ specialty }, true);
  let obstacles = 0;
  let outsideRadius = 0;
  const candidates = records.flatMap((record) => {
    const assessed = assess(record, needs);
    if (assessed.unmet) {
      obstacles++;
      return [];
    }
    const point = sourceLocation(record);
    const distance = origin ? distanceKm(origin, point) : null;
    if (distance !== null && radius !== null && distance > radius) {
      outsideRadius++;
      return [];
    }
    const practice = { ...assessed };
    delete practice.sourceFields;
    return [
      {
        ...practice,
        doctolibUrl: safeDoctolib(practice.doctolibUrl),
        websiteUrl: safeWebsite(practice.websiteUrl),
        sourceUrl: safeAccesLibre(practice.sourceUrl),
        distanceKm: distance,
        distanceKind: 'straight_line',
        location: point,
        needsConfirmation: assessed.unknown > 0 || (radius !== null && distance === null),
        administrative: {
          registration: null,
          sector: null,
          fees: null,
          carteVitale: null,
          source: null,
        },
      },
    ];
  });
  const preferPostcodes = Array.isArray(input.preferPostcodes)
    ? input.preferPostcodes.filter((code) => /^\d{5}$/.test(String(code)))
    : [];
  const inPreferred = (practice) =>
    preferPostcodes.some((code) => String(practice.address || '').includes(code));
  candidates.sort(
    (a, b) =>
      Number(inPreferred(b)) - Number(inPreferred(a)) ||
      Number(a.needsConfirmation) - Number(b.needsConfirmation) ||
      b.met - a.met ||
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
      a.name.localeCompare(b.name, 'fr'),
  );
  const pageSize = 12;
  return {
    needs,
    results: candidates.slice((page - 1) * pageSize, page * pageSize),
    dataset,
    origin: origin
      ? { ...origin, label: input.origin.label, approximate: input.origin.approximate !== false }
      : null,
    page,
    pageSize,
    total: candidates.length,
    counts: {
      searched: records.length,
      knownObstaclesExcluded: obstacles,
      outsideRadius,
      declaredMatches: candidates.filter((practice) => !practice.needsConfirmation).length,
    },
    limitations: [
      'Les informations d’accessibilité sont déclaratives ; elles ne garantissent pas l’accès.',
      'Distances à vol d’oiseau ; aucun itinéraire accessible n’est vérifié.',
      'Inscription RPPS, secteur, tarifs et Carte Vitale non vérifiés dans cette source.',
    ],
  };
}
