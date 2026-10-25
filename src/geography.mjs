import { z } from 'zod';
export const placeSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100).nullable().optional(),
    cityCode: z
      .string()
      .regex(/^[0-9A-Z]{5}$/)
      .nullable()
      .optional(),
    postcode: z
      .string()
      .regex(/^\d{5}$/)
      .nullable()
      .optional(),
    district: z.number().int().min(1).max(20).nullable().optional(),
    kind: z.enum(['auto', 'municipality', 'address', 'landmark']).default('auto'),
  })
  .strict();
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

const plain = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const districtOf = (value) => {
  const match = plain(value).match(/\b(\d{1,2})(?:er|e(?:me)?)(?:\s+arrondissement)?\s*$/);
  return match ? Number(match[1]) : null;
};
const municipalityName = (properties) =>
  String(properties.city || properties.name || properties.label || '')
    .replace(/\b\d{5}\b.*$/, '')
    .replace(/\s+\d{1,2}(?:er|e(?:me)?|ème)?\s*arrondissement.*$/i, '')
    .trim();
const containsPlace = (query, city) => (' ' + plain(query) + ' ').includes(' ' + plain(city) + ' ');
function propertiesOf(feature) {
  return feature &&
    typeof feature === 'object' &&
    feature.properties &&
    typeof feature.properties === 'object'
    ? feature.properties
    : {};
}
function usable(feature) {
  const p = propertiesOf(feature),
    [longitude, latitude] = Array.isArray(feature.geometry?.coordinates)
      ? feature.geometry.coordinates
      : [];
  return (
    coordinates({ latitude, longitude }) &&
    typeof p.label === 'string' &&
    p.label.length <= 250 &&
    typeof p.postcode === 'string' &&
    /^\d{5}$/.test(p.postcode)
  );
}
function matches(feature, place, district, municipality = false) {
  if (!usable(feature)) return false;
  const p = propertiesOf(feature);
  if (municipality && p.type !== 'municipality') return false;
  if (place.cityCode && p.citycode !== place.cityCode) return false;
  if (place.postcode && p.postcode !== place.postcode) return false;
  const name = municipalityName(p);
  if (
    place.city
      ? plain(name) !== plain(place.city)
      : !place.postcode && !place.cityCode && !containsPlace(place.query, name)
  )
    return false;
  if (
    municipality &&
    district === null &&
    !place.postcode &&
    !place.cityCode &&
    districtOf(p.name || p.city || p.label) !== null
  )
    return false;
  if (district !== null && municipality && districtOf(p.name || p.city || p.label) !== district)
    return false;
  return true;
}
function locations(features, district) {
  const seen = new Set();
  return features
    .flatMap((feature) => {
      if (!usable(feature)) return [];
      const p = propertiesOf(feature),
        [longitude, latitude] = feature.geometry.coordinates;
      const key = p.id ? String(p.id) : `${p.citycode || ''}:${p.label}:${latitude}:${longitude}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          latitude,
          longitude,
          label: p.label,
          source: 'IGN · Base Adresse Nationale',
          approximate: p.type !== 'housenumber',
          city: typeof p.city === 'string' ? p.city.slice(0, 100) : null,
          cityCode:
            typeof p.citycode === 'string' && /^[0-9A-Z]{5}$/.test(p.citycode) ? p.citycode : null,
          postcode: p.postcode,
          district:
            district ??
            (p.type === 'municipality' ? districtOf(p.name || p.city || p.label) : null),
          context: typeof p.context === 'string' ? p.context.slice(0, 250) : null,
          sourceId: typeof p.id === 'string' ? p.id.slice(0, 150) : null,
          type: typeof p.type === 'string' ? p.type.slice(0, 40) : null,
        },
      ];
    })
    .slice(0, 5);
}
async function fetchFeatures(query, transport, filters = {}) {
  const url = new URL('https://data.geopf.fr/geocodage/search');
  url.search = new URLSearchParams({
    q: query,
    index: 'address',
    limit: '10',
    autocomplete: '0',
    ...filters,
  });
  const response = await transport(url.href, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('La recherche de lieu IGN est indisponible.');
  const data = await response.json();
  if (!Array.isArray(data.features)) throw new Error('La réponse géographique IGN est invalide.');
  return data.features.slice(0, 10).filter((feature) => feature && typeof feature === 'object');
}
// IGN commune/postcode filters: https://adresse.data.gouv.fr/outils/api-doc/adresse
export async function geocodePlace(value, transport = fetch) {
  const parsed = placeSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      'Lieu structuré invalide. Précisez la commune et, si nécessaire, l’arrondissement.',
    );
  const place = parsed.data;
  if (!place.postcode && !place.cityCode)
    place.postcode = place.query.match(/\b\d{5}\b/)?.[0] || null;
  const district = place.district ?? districtOf(place.query);
  const cityQuery = place.city
    ? place.city + (district === null ? '' : ` ${district}e`)
    : place.query;
  const filters = {
    ...(place.postcode ? { postcode: place.postcode } : {}),
    ...(place.cityCode ? { citycode: place.cityCode } : {}),
  };
  const municipalities = (
    await fetchFeatures(cityQuery, transport, { ...filters, type: 'municipality' })
  ).filter((feature) => matches(feature, place, district, true));
  if (!municipalities.length) return [];
  const municipalityQuery = municipalities.some(
    (feature) =>
      plain(place.query).replace(/ arrondissement$/, '') ===
      plain(propertiesOf(feature).name || propertiesOf(feature).label).replace(
        / arrondissement$/,
        '',
      ),
  );
  if (
    place.kind === 'municipality' ||
    (place.kind === 'auto' && (municipalityQuery || /^\d{5}$/.test(place.query)))
  )
    return locations(municipalities, district);
  const codes = new Set(
    municipalities.map((feature) => propertiesOf(feature).citycode).filter(Boolean),
  );
  const postcodes = new Set(municipalities.map((feature) => propertiesOf(feature).postcode));
  const query =
    place.city && !containsPlace(place.query, place.city)
      ? place.query + ' ' + cityQuery
      : place.query;
  const found = (await fetchFeatures(query, transport, filters)).filter(
    (feature) =>
      matches(feature, place, null) &&
      (district === null ||
        (codes.size
          ? codes.has(propertiesOf(feature).citycode)
          : postcodes.has(propertiesOf(feature).postcode))),
  );
  return locations(found, district);
}
export async function geocode(query, transport = fetch) {
  if (typeof query !== 'string' || query.trim().length < 3 || query.length > 200)
    throw new Error('Adresse ou quartier requis.');
  return geocodePlace({ query: query.trim(), kind: 'auto' }, transport);
}
