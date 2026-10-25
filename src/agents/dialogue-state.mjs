import { z } from 'zod';
import { criteria } from '../core.mjs';
const fields = ['specialty', 'place', 'radius', 'access', 'width', 'communication', 'vision'];
const point = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(250),
    approximate: z.boolean().default(true),
    source: z.literal('IGN · Base Adresse Nationale').optional(),
    city: z.string().max(100).nullable().optional(),
    cityCode: z
      .string()
      .regex(/^[0-9A-Z]{5}$/)
      .nullable()
      .optional(),
    postcode: z
      .string()
      .regex(/^\d{5}$/)
      .optional(),
    district: z.number().int().min(1).max(20).nullable().optional(),
    context: z.string().max(250).nullable().optional(),
    sourceId: z.string().max(150).nullable().optional(),
    type: z.string().max(40).nullable().optional(),
  })
  .strict();
const stateSchema = z
  .object({
    needs: z
      .object({
        keys: z
          .array(z.enum(Object.keys(criteria)))
          .max(10)
          .refine((keys) => new Set(keys).size === keys.length),
        minWidth: z.number().min(40).max(200).nullable(),
      })
      .strict()
      .default({ keys: [], minWidth: null }),
    specialty: z.string().max(200).default(''),
    placeQuery: z.string().max(200).default(''),
    origin: point.nullable().default(null),
    radiusKm: z.number().min(0.1).max(50).nullable().default(null),
    answered: z.array(z.enum(fields)).max(7).default([]),
    unknown: z.array(z.enum(fields)).max(7).default([]),
    locationChoices: z.array(point).max(5).default([]),
    pending: z
      .enum([...fields, 'location'])
      .nullable()
      .default(null),
    communicationPrompt: z.boolean().default(false),
    visionPrompt: z.boolean().default(false),
    notes: z.array(z.string().max(300)).max(5).default([]),
    source: z.enum(['local', 'openai']).default('local'),
  })
  .strict();
const bodySchema = z
  .object({
    message: z.string().trim().min(1).max(2000).optional(),
    action: z.enum(['confirm', 'clear', 'page']).optional(),
    answer: z
      .object({ field: z.enum([...fields, 'location']), value: z.string().min(1).max(200) })
      .strict()
      .optional(),
    state: stateSchema.nullable().optional(),
    consent: z.boolean().optional(),
    page: z.number().int().min(1).max(10000).optional(),
  })
  .strict();
export function dialogueInput(body) {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    throw new Error('Message ou état de recherche invalide. Corrigez votre réponse.');
  const input = parsed.data;
  if ([input.message, input.answer, input.action].filter(Boolean).length !== 1)
    throw new Error('Envoyez une seule réponse à la fois.');
  const state = input.state || stateSchema.parse({});
  if (state.needs.minWidth !== null && !state.needs.keys.includes('width'))
    throw new Error('Largeur sans critère correspondant.');
  return { ...input, state };
}
export function answered(state, field, unknown = false) {
  state.answered = [...new Set([...state.answered, field])];
  state.unknown = [...state.unknown.filter((key) => key !== field), ...(unknown ? [field] : [])];
}
const option = (label, value = label) => ({ label, value });
export function nextQuestion(state, specialties) {
  const done = (field) => state.answered.includes(field);
  let id, text, options;
  if (!done('specialty')) {
    id = 'specialty';
    text = 'Quel professionnel cherchez-vous ?';
    options = specialties.slice(0, 6).map((label) => option(label));
    options.push(option('Sans préférence', '__none__'), option('Autre profession', '__free__'));
  } else if (!done('place')) {
    if (state.locationChoices.length) {
      id = 'location';
      text = 'Quel lieu trouvé par IGN correspond à votre recherche ?';
      options = state.locationChoices.map((place, index) =>
        option(
          place.label +
            (place.postcode && !place.label.includes(place.postcode)
              ? ' · ' + place.postcode
              : '') +
            (place.context ? ' · ' + place.context : '') +
            (place.approximate ? ' · point approximatif' : ''),
          String(index),
        ),
      );
      options.push(option('Saisir un autre lieu', '__free__'));
    } else {
      id = 'place';
      text = 'Dans quelle ville, quel quartier ou près de quelle adresse ?';
      options = [option('Sans contrainte géographique', '__none__')];
    }
  } else if (state.origin && !done('radius')) {
    id = 'radius';
    text = 'À quelle distance maximale de cette adresse ?';
    options = [1, 3, 5, 10].map((km) => option(km + ' km', String(km)));
    options.push(option('Sans limite', '__none__'));
  } else if (!done('access')) {
    id = 'access';
    text = 'Quel besoin d’accès est indispensable pour votre visite ?';
    options = [
      'Sans marche',
      'Passage large',
      'Communication adaptée',
      'Signalétique',
      'Sanitaires adaptés',
    ].map((label) => option(label));
    options.push(
      option('Autre besoin', '__free__'),
      option('Pas de contrainte particulière', '__none__'),
    );
  } else if (state.communicationPrompt && !done('communication')) {
    id = 'communication';
    text = 'Quel aménagement de communication souhaitez-vous ?';
    options = [
      option('Échange écrit', 'communication'),
      option('Équipement auditif', 'hearing'),
      option('LSF', 'signLanguage'),
      option('Autre aménagement', '__free__'),
    ];
  } else if (state.visionPrompt && !done('vision')) {
    id = 'vision';
    text = 'Quel aménagement vous aiderait à vous orienter ?';
    options = [
      option('Signalétique lisible', 'signage'),
      option('Aide humaine à l’orientation', 'orientation'),
      option('Autre besoin', '__free__'),
    ];
  } else if (state.needs.keys.includes('width') && !done('width')) {
    id = 'width';
    text =
      'Quelle largeur de passage vous faut-il ? Une mesure en cm ou en mètres suffit ; aucune largeur n’est supposée.';
    options = [option('Saisir ma mesure', '__free__')];
  } else return null;
  options.push(option('Je ne sais pas', '__unknown__'));
  return { id, text, options };
}
export function dialogueSummary(state) {
  const access = state.needs.keys.map(
    (key) =>
      criteria[key].label +
      (key === 'width'
        ? state.needs.minWidth === null
          ? ' (mesure inconnue)'
          : ` (${state.needs.minWidth} cm)`
        : ''),
  );
  return [
    state.specialty ||
      (state.unknown.includes('specialty')
        ? 'Profession non précisée'
        : 'Sans préférence de profession'),
    state.origin?.label ||
      (state.unknown.includes('place')
        ? 'Lieu inconnu · distance non calculée'
        : state.placeQuery
          ? state.placeQuery + ' · lieu à confirmer'
          : 'Sans contrainte géographique'),
    state.origin
      ? state.radiusKm === null
        ? 'Rayon sans limite précise'
        : `≤ ${state.radiusKm} km de cette adresse`
      : '',
    access.length
      ? access.join(', ')
      : state.unknown.includes('access')
        ? 'Besoins d’accès non précisés'
        : 'Aucun critère indispensable déclaré',
    ...['communication', 'vision']
      .filter((field) => state.unknown.includes(field))
      .map(
        (field) => `Aménagement ${field === 'vision' ? 'visuel' : 'de communication'} non précisé`,
      ),
    ...state.notes.map((note) => note + ' · à confirmer auprès du cabinet'),
  ]
    .filter(Boolean)
    .join('\n');
}
