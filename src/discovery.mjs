import { coordinates, geocode } from './geography.mjs';
export { coordinates, geocode };
import { assess, criteria, safeAccesLibre, safeDoctolib, safeWebsite } from './core.mjs';
import { createPracticeStore } from './practice-store.mjs';
import { getTranslator } from './i18n-core.mjs';

export const criterionKeys = Object.keys(criteria);
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

export function validateRequirements(value, language = 'fr') {
  const t = getTranslator(language);
  if (
    !value ||
    !Array.isArray(value.keys) ||
    value.keys.length > criterionKeys.length ||
    value.keys.some((key) => !criterionKeys.includes(key)) ||
    new Set(value.keys).size !== value.keys.length ||
    (value.minWidth !== null &&
      (!Number.isFinite(value.minWidth) || value.minWidth < 40 || value.minWidth > 200))
  )
    throw new Error(t('search.errors.invalidCriteria'));
  return { keys: value.keys, minWidth: value.minWidth };
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

export async function findPractices(database, input, language = 'fr') {
  const t = getTranslator(language);
  if (
    !input ||
    input.confirmed !== true ||
    Object.keys(input).some(
      (key) =>
        ![
          'confirmed',
          'needs',
          'specialty',
          'origin',
          'radiusKm',
          'page',
          'preferPostcodes',
        ].includes(key),
    )
  )
    throw new Error(t('search.errors.confirmCriteria'));
  const needs = validateRequirements(input.needs, language);
  const origin =
    input.origin === null || input.origin === undefined ? null : coordinates(input.origin);
  if (
    input.origin !== null &&
    input.origin !== undefined &&
    (!origin || typeof input.origin.label !== 'string' || input.origin.label.length > 250)
  )
    throw new Error(t('search.errors.origin'));
  const district = input.origin?.district ?? null;
  if (
    district !== null &&
    (!Number.isInteger(district) ||
      district < 1 ||
      district > 20 ||
      !/^\d{5}$/.test(input.origin.postcode))
  )
    throw new Error(t('search.errors.district'));
  const districtPostcode = district === null ? null : input.origin.postcode;
  const radius = input.radiusKm ?? null;
  if (radius !== null && (!Number.isFinite(radius) || radius < 0.1 || radius > 50))
    throw new Error(t('search.errors.radius'));
  if (radius !== null && !origin) throw new Error(t('search.errors.missingOrigin'));
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error(t('search.errors.page'));
  const store = createPracticeStore(database);
  const catalog = await store.catalog();
  const specialty = input.specialty || '';
  if (typeof specialty !== 'string' || (specialty && !catalog.specialties.includes(specialty)))
    throw new Error(t('search.errors.specialty'));
  const { records, dataset } = await store.candidates({ specialty }, true);
  let obstacles = 0;
  let outsideRadius = 0;
  let outsideGeography = 0;
  const candidates = records.flatMap((record) => {
    if (districtPostcode && record.postalCode !== districtPostcode) {
      outsideGeography++;
      return [];
    }
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
        entityType: 'establishment',
        needsConfirmation:
          !needs.keys.length || assessed.unknown > 0 || (radius !== null && distance === null),
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
  candidates.sort(
    (a, b) =>
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
      ? {
          ...origin,
          label: input.origin.label,
          approximate: input.origin.approximate !== false,
          cityCode: input.origin.cityCode ?? null,
          postcode: input.origin.postcode ?? null,
          district,
        }
      : null,
    page,
    pageSize,
    total: candidates.length,
    counts: {
      searched: records.length,
      knownObstaclesExcluded: obstacles,
      outsideRadius,
      outsideGeography,
      declaredMatches: candidates.filter((practice) => !practice.needsConfirmation).length,
    },
    limitations: [
      t('search.results.accessLimit'),
      t('search.results.distanceLimit'),
      t('search.results.registrationLimit'),
    ],
  };
}
