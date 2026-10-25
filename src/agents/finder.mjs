import { criteria, doctolibDirectoryUrl, parseNeeds } from '../core.mjs';
import { aiConfiguration, interpretNeeds } from './needs-agent.mjs';
import { createPracticeStore } from '../practice-store.mjs';
import { findPractices, geocode } from '../discovery.mjs';

const labels = Object.fromEntries(
  Object.entries(criteria).map(([key, value]) => [key, value.label]),
);

function plain(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function listCriteria(needs) {
  if (!needs?.keys?.length) return 'Aucun critère reconnu.';
  const width =
    needs.minWidth !== null && needs.keys.includes('width')
      ? ` (passage ${needs.minWidth} cm)`
      : '';
  return needs.keys.map((key) => labels[key] || key).join(', ') + width;
}

const PLACE_STOP = new Set(
  [
    'je',
    'me',
    'suis',
    'un',
    'une',
    'des',
    'les',
    'le',
    'la',
    'de',
    'du',
    'au',
    'aux',
    'et',
    'ou',
    'en',
    'avec',
    'pour',
    'pas',
    'mon',
    'ma',
    'mes',
    'cherche',
    'chercher',
    'besoin',
    'deplace',
    'deplacer',
    'utilise',
    'utilisant',
    'passage',
    'porte',
    'entree',
    'salle',
    'fauteuil',
    'roulant',
    'electrique',
    'canne',
    'blanche',
    'malentendant',
    'sourd',
    'malvoyant',
    'aveugle',
    'lsf',
    'medecin',
    'generaliste',
    'dentiste',
    'kine',
    'kinesitherapeute',
    'orl',
    'cm',
    'docteur',
    'cabinet',
    'autour',
    'pres',
    'vers',
    'quartier',
    'plutot',
    'aussi',
    'bonjour',
    'proximite',
    'dans',
    'sur',
  ].map((word) => plain(word)),
);

const SPECIALTY_ALIASES = [
  { pattern: /\b(?:medecin\s+)?generaliste\b/, hint: 'Médecin généraliste' },
  { pattern: /\b(?:chirurgien\s+)?dentiste\b/, hint: 'Dentiste, chirurgien dentiste' },
  { pattern: /\bkinesitherapeute\b|\bkine\b/, hint: 'Kinésithérapeute' },
  { pattern: /\borl\b/, hint: 'Médecin orl' },
  {
    pattern: /\bmaison de sante\b|\bcentre de sante\b/,
    hint: 'Maison de santé ou centre de santé',
  },
];

function resolveInCatalog(hint, specialties) {
  const target = plain(hint);
  return (
    specialties.find((specialty) => plain(specialty) === target) ||
    specialties.find((specialty) => plain(specialty).includes(target)) ||
    ''
  );
}

export function matchSpecialty(text, specialties) {
  const source = plain(text);
  const list = [...specialties].filter(Boolean);
  const exact =
    [...list]
      .sort((a, b) => b.length - a.length)
      .find((specialty) => source.includes(plain(specialty))) || '';
  if (exact) return exact;
  for (const alias of SPECIALTY_ALIASES) {
    if (!alias.pattern.test(source)) continue;
    const resolved = resolveInCatalog(alias.hint, list);
    if (resolved) return resolved;
  }
  // Distinctive last word of a catalog specialty (e.g. « généraliste », « orl »).
  return (
    [...list]
      .map((specialty) => {
        const tokens = plain(specialty)
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length >= 4);
        const tip = tokens.at(-1);
        return tip && new RegExp(String.raw`\b${tip}\b`).test(source) ? specialty : '';
      })
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || ''
  );
}

function cleanPlace(value) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b(et|je|cherche|un|une|des|medecin|generaliste|dentiste)\b.*$/i, '')
    .trim();
}

/** Keep the place the patient typed (landmark + arrondissement), not only the IGN city. */
export function extractPlaceQuery(text) {
  const normalized = plain(text);
  const district = normalized.match(
    /\b([a-z][a-z'-]{2,40})\s+(\d{1,2})(?:er|e(?:me)?|th)?\b(?!\s*(?:km|m|metres?|kilometres?)\b)/,
  );
  if (district && !PLACE_STOP.has(district[1])) {
    const context = normalized.match(/\b(?:autour|pres|a proximite)\s+de\s+([^,.!?]+)/);
    return context && context[1].includes(district[0])
      ? cleanPlace(context[1]).replace(/(\d+)(?:eme|er)\b/g, '$1e')
      : `${district[1]} ${district[2]}e`;
  }
  const patterns = [
    { re: /\b(\d{5})\b/, kind: 'postal' },
    { re: /\b(?:autour|pres|a proximite)\s+de\s+([^,.!?]+)/ },
    { re: /\bpres du\s+([^,.!?]+)/ },
    { re: /\bvers\s+([^,.!?]+)/ },
    { re: /\bau\s+quartier\s+(?:de\s+)?([^,.!?]+)/ },
    { re: /\bdans le quartier\s+(?:de\s+)?([^,.!?]+)/ },
    { re: /\bdans (?:la|le) ([a-z][a-z'-]{2,40})\b/ },
    { re: /\ba\s+(?!un\b|une\b)([a-z][a-z'-]{2,40})\b/ },
  ];
  for (const { re, kind } of patterns) {
    const match = normalized.match(re);
    if (!match) continue;
    if (kind === 'postal') return match[1];
    const place = cleanPlace(match[1]);
    if (!place || place.length < 3 || PLACE_STOP.has(plain(place))) continue;
    return place;
  }
  // Fallback: leftover city/place token (e.g. « grenoble ») after removing need words.
  const leftover = normalized
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !PLACE_STOP.has(token) && !/^\d/.test(token));
  return leftover.join(' ');
}

/** Label shown in the chat: what they typed, plus rayon. */
export function aroundLabel(state) {
  const typed = String(state?.placeQuery || '').trim();
  const origin = String(state?.origin?.label || '').trim();
  const place = typed || origin;
  if (!place) return '';
  const nice = place
    .replace(/\bparis\b/gi, 'Paris')
    .replace(/\b(\d{1,2})e\b/gi, '$1e')
    .replace(/\bdenfert\b/gi, 'Denfert')
    .replace(/\bbastille\b/gi, 'Bastille')
    .replace(/\brepublique\b/gi, 'République')
    .replace(/\bnation\b/gi, 'Nation');
  const radius =
    state?.origin && state?.radiusKm
      ? ` · ≤ ${state.radiusKm} km`
      : !state?.origin && typed
        ? ' (lieu à préciser)'
        : '';
  return nice + radius;
}

function emptyState() {
  return {
    needs: { keys: [], minWidth: null },
    specialty: '',
    origin: null,
    placeQuery: '',
    radiusKm: null,
    source: 'local',
  };
}

function readState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyState();
  const keys = Array.isArray(value.needs?.keys)
    ? value.needs.keys.filter((key) => labels[key])
    : [];
  const minWidth =
    value.needs?.minWidth === null || value.needs?.minWidth === undefined
      ? null
      : Number(value.needs.minWidth);
  return {
    needs: {
      keys: [...new Set(keys)],
      minWidth: Number.isFinite(minWidth) ? minWidth : null,
    },
    specialty: typeof value.specialty === 'string' ? value.specialty : '',
    origin:
      value.origin &&
      Number.isFinite(value.origin.latitude) &&
      Number.isFinite(value.origin.longitude)
        ? {
            latitude: value.origin.latitude,
            longitude: value.origin.longitude,
            label: String(value.origin.label || '').slice(0, 250),
            approximate: value.origin.approximate !== false,
          }
        : null,
    placeQuery: typeof value.placeQuery === 'string' ? value.placeQuery.slice(0, 200) : '',
    radiusKm: (() => {
      const radius = Number(value.radiusKm);
      return Number.isFinite(radius) && radius >= 0.1 && radius <= 50 ? radius : null;
    })(),
    source: value.source === 'openai' ? 'openai' : 'local',
  };
}

/**
 * Postcodes implied by what the patient typed (« Paris 15e », « 75015 »).
 * Do not read the IGN label — « Bastille 35190 Saint-Thual » must not become a district filter.
 */
export function targetPostcodes(placeQuery = '') {
  const text = String(placeQuery || '');
  const plainText = plain(text);
  const explicit = text.match(/\b(\d{5})\b/);
  if (explicit) return [explicit[1]];
  const parisArr =
    plainText.match(
      /\bparis\s+(\d{1,2})(?:\s*(?:er|e(?:me)?|th))?\b(?!\s*(?:km|m|metres?|kilometres?)\b)/,
    ) || plainText.match(/\bparis.*\b(\d{1,2})\s*e(?:r|me)?\s+arrondissement\b/);
  if (parisArr) {
    const n = Number(parisArr[1]);
    if (n >= 1 && n <= 20) return [`75${String(n).padStart(3, '0')}`];
  }
  return [];
}

export function geocodeQueryFor(placeQuery) {
  return String(placeQuery || '').trim();
}

function inTargetDistrict(practice, postcodes) {
  if (!postcodes.length) return false;
  const address = String(practice.address || '');
  return postcodes.some((code) => address.includes(code));
}

function defaultRadiusKm(_state) {
  // Always search close to what the patient typed (landmark, city, or arrondissement).
  return 5;
}

function withRadius(state) {
  if (!state.origin) return { ...state, radiusKm: null };
  const radius =
    Number.isFinite(state.radiusKm) && state.radiusKm >= 0.1 && state.radiusKm <= 50
      ? state.radiusKm
      : defaultRadiusKm(state);
  return { ...state, radiusKm: radius };
}

function summary(state) {
  const parts = [listCriteria(state.needs)];
  if (state.specialty) parts.push(state.specialty);
  if (state.origin?.label) {
    parts.push(state.origin.label + (state.radiusKm ? ` · ≤ ${state.radiusKm} km` : ''));
  } else if (state.placeQuery) parts.push(state.placeQuery + ' (lieu à préciser)');
  return parts.join(' · ');
}

async function resolvePlace(placeQuery, steps) {
  if (!placeQuery) return null;
  steps.push({ label: 'Localisation IGN' });
  try {
    const locations = await geocode(geocodeQueryFor(placeQuery));
    return locations[0]
      ? {
          latitude: locations[0].latitude,
          longitude: locations[0].longitude,
          label: locations[0].label,
          approximate: locations[0].approximate !== false,
        }
      : null;
  } catch {
    return null;
  }
}

const SOFT_CRITERIA = ['signage', 'sensory', 'communication', 'signLanguage'];

function rankPractices(practices, postcodes = []) {
  const ordered = [...practices].sort(
    (a, b) =>
      Number(inTargetDistrict(b, postcodes)) - Number(inTargetDistrict(a, postcodes)) ||
      Number(b.complete) - Number(a.complete) ||
      (b.met || 0) - (a.met || 0) ||
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'fr'),
  );
  const complete = ordered.filter(
    (practice) => practice.checks?.length && practice.checks.every((check) => check.fit === 'met'),
  );
  const bestMet = ordered.reduce((max, practice) => Math.max(max, practice.met || 0), 0);
  return { complete, ordered, bestMet };
}

function sparseKeys(practices, keys) {
  return keys.filter((key) => {
    const rows = practices.filter((practice) =>
      practice.checks?.some((check) => check.key === key),
    );
    if (!rows.length) return false;
    const unknown = rows.filter((practice) =>
      practice.checks.some((check) => check.key === key && check.fit === 'unknown'),
    ).length;
    return unknown / rows.length >= 0.8;
  });
}

function dropKeyForRelax(needs) {
  const soft = [...needs.keys].reverse().find((key) => SOFT_CRITERIA.includes(key));
  return soft || needs.keys.at(-1) || null;
}

function describeResults(state, found, ranked) {
  const totalKeys = state.needs.keys.length;
  const completeCount = ranked.complete.length;
  const sparse = sparseKeys(ranked.ordered, state.needs.keys);
  const excluded = found.counts?.knownObstaclesExcluded;
  const excludedBit =
    Number.isFinite(excluded) && excluded > 0 ? ` · ${excluded} exclus (obstacle connu)` : '';
  if (!found.total) {
    return (
      'Aucun cabinet trouvé' +
      (state.origin && state.radiusKm ? ` dans ${state.radiusKm} km` : '') +
      '. Élargissez le rayon ou corrigez votre message.'
    );
  }
  if (completeCount)
    return `${found.total} cabinet${found.total > 1 ? 's' : ''} sans obstacle connu documenté, dont ${completeCount} avec tous les critères renseignés${excludedBit}.`;
  return (
    `${found.total} cabinet${found.total > 1 ? 's' : ''} · meilleures fiches ${ranked.bestMet}/${totalKeys}` +
    (sparse.length
      ? ` · souvent manquant : ${sparse.map((key) => labels[key] || key).join(', ')}`
      : '') +
    excludedBit +
    '.'
  );
}

async function search(state, env, steps, page = 1) {
  steps.push({ label: 'Recherche Accès Libre' });
  const query = withRadius(state);
  const postcodes = targetPostcodes(state.placeQuery);
  const found = await findPractices(env.DB, {
    confirmed: true,
    needs: { keys: query.needs.keys, minWidth: query.needs.minWidth },
    specialty: query.specialty || '',
    origin: query.origin,
    radiusKm: query.radiusKm,
    preferPostcodes: postcodes,
    page,
  });
  const withComplete = found.results.map((practice) => ({
    ...practice,
    complete: practice.checks?.length > 0 && practice.checks.every((check) => check.fit === 'met'),
  }));
  const ranked = rankPractices(withComplete, postcodes);
  const completeCount = ranked.complete.length;
  state = { ...state, radiusKm: query.radiusKm };
  const drop = dropKeyForRelax(state.needs);
  const reply = describeResults(state, found, ranked);

  const actions = [{ id: 'clear', label: 'Recommencer' }];
  if (state.origin && state.radiusKm && state.radiusKm < 25) {
    actions.unshift({ id: 'widen', label: 'Élargir la recherche' });
  }
  if (state.needs.keys.length > 1 && drop && !completeCount) {
    actions.unshift({
      id: 'relax',
      label: `Sans « ${labels[drop] || drop} »`,
    });
  }

  return {
    reply,
    steps,
    state,
    actions,
    results: {
      total: found.total,
      page: found.page,
      pageSize: found.pageSize,
      dataset: found.dataset,
      completeCount,
      bestMet: ranked.bestMet,
      needed: state.needs.keys.length,
      sparseKeys: sparseKeys(ranked.ordered, state.needs.keys),
      counts: found.counts,
      limitations: found.limitations,
      originLabel: state.origin?.label || state.placeQuery || '',
      doctolibSearchUrl: doctolibDirectoryUrl(
        state.specialty,
        state.origin?.label || state.placeQuery,
      ),
      practices: ranked.ordered.map((practice) => ({
        id: practice.id,
        name: practice.name,
        specialty: practice.specialty,
        address: practice.address,
        doctolibUrl: practice.doctolibUrl,
        websiteUrl: practice.websiteUrl,
        sourceUrl: practice.sourceUrl,
        source: practice.source,
        evidence: practice.evidence,
        distanceKm: practice.distanceKm,
        needsConfirmation: practice.needsConfirmation,
        complete: practice.complete,
        met: practice.met,
        checks: practice.checks,
        category: practice.category,
      })),
    },
  };
}

function confirmPayload(state, steps, extra = '') {
  return {
    reply:
      (extra ? extra + '\n' : '') +
      'Confirmez pour lancer la recherche, ou corrigez votre message.',
    steps,
    state,
    actions: [
      { id: 'confirm', label: 'Chercher' },
      { id: 'clear', label: 'Recommencer' },
    ],
    results: null,
  };
}

export function finderConfig(env = {}) {
  return { ...aiConfiguration(env), localRules: true };
}

export async function runFinder(body, env = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Message invalide.');
  const action = typeof body.action === 'string' ? body.action : '';
  const consent = body.consent === true;
  if (body.consent !== true && body.consent !== false && body.consent !== undefined)
    throw new Error('Consentement invalide.');

  let state = readState(body.state);
  const steps = [];
  const catalog = await createPracticeStore(env.DB).catalog();

  if (action === 'clear') {
    return {
      reply: '',
      steps: [],
      state: emptyState(),
      actions: [],
      results: null,
    };
  }

  const page = Math.max(1, Math.min(50, Number(body.page) || 1));

  if (action === 'confirm' || action === 'search') {
    if (!state.needs.keys.length) throw new Error('Aucun critère à confirmer.');
    if (state.specialty && !catalog.specialties.includes(state.specialty)) state.specialty = '';
    if (!state.origin && state.placeQuery) {
      state.origin = await resolvePlace(state.placeQuery, steps);
      if (!state.origin) steps.push({ label: 'Lieu non trouvé · recherche sans distance' });
    }
    return search(state, env, steps, page);
  }

  if (action === 'widen' && state.origin) {
    const next = Math.min(25, (state.radiusKm || 10) + 10);
    return search({ ...state, radiusKm: next }, env, [{ label: `Rayon ${next} km` }], page);
  }

  if (action === 'relax' && state.needs.keys.length > 1) {
    const drop = dropKeyForRelax(state.needs);
    const keys = state.needs.keys.filter((key) => key !== drop);
    state = {
      ...state,
      needs: {
        keys,
        minWidth: keys.includes('width') ? state.needs.minWidth : null,
      },
    };
    return search(
      state,
      env,
      [{ label: 'Critère retiré' + (drop && labels[drop] ? ' · ' + labels[drop] : '') }],
      page,
    );
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 2000)
    throw new Error('Écrivez un besoin en 2 000 caractères maximum.');

  steps.push({ label: 'Lecture du message' });
  let needs = parseNeeds(message);
  let source = 'local';
  const specialty = matchSpecialty(message, catalog.specialties) || state.specialty;
  const extractedPlace = extractPlaceQuery(message);
  const placeQuery = extractedPlace || state.placeQuery;
  const placeChanged = Boolean(extractedPlace && extractedPlace !== state.placeQuery);

  const ambiguous =
    !needs.keys.length ||
    /mais|pas |sans |plutot|sauf|except/.test(plain(message)) ||
    (Boolean(specialty) && Boolean(placeQuery));

  if (consent && aiConfiguration(env).available && ambiguous) {
    steps.push({ label: 'OpenAI · extraction' });
    try {
      const ai = await interpretNeeds({ description: message, consent: true }, env);
      needs = {
        keys: ai.keys,
        minWidth: ai.minWidth,
        clarification: null,
        questions: ai.questions || [],
      };
      source = 'openai';
      if (ai.questions?.length) {
        state = {
          ...state,
          needs: needs.keys.length ? { keys: needs.keys, minWidth: needs.minWidth } : state.needs,
          specialty,
          placeQuery,
          origin: placeChanged ? null : state.origin,
          radiusKm: placeChanged ? null : state.radiusKm,
          source,
        };
        return {
          reply: 'Avant de chercher : ' + ai.questions.join(' ') + '\n\n' + summary(state),
          steps,
          state,
          actions: state.needs.keys.length
            ? [
                { id: 'confirm', label: 'Chercher quand même' },
                { id: 'clear', label: 'Recommencer' },
              ]
            : [{ id: 'clear', label: 'Recommencer' }],
          results: null,
        };
      }
    } catch (error) {
      steps.push({ label: 'Repli sur les règles locales' });
      if (!needs.keys.length && !state.needs.keys.length) throw error;
    }
  }

  // Keep prior accessibility needs when the turn only adds profession / lieu.
  state = {
    needs: needs.keys.length ? { keys: needs.keys, minWidth: needs.minWidth } : state.needs,
    specialty,
    placeQuery,
    origin: placeChanged ? null : state.origin,
    radiusKm: placeChanged ? null : state.radiusKm,
    source,
  };

  if (placeQuery && !state.origin) {
    state.origin = await resolvePlace(placeQuery, steps);
  }

  if (!state.needs.keys.length) {
    return {
      reply:
        needs.clarification ||
        'Je n’ai pas reconnu de besoin d’accessibilité. Exemple : fauteuil, canne blanche, LSF, malentendant. Vous pouvez aussi citer une profession du catalogue.',
      steps,
      state,
      actions: [],
      results: null,
    };
  }

  if (needs.clarification && needs.keys.includes('width') && needs.minWidth === null) {
    return confirmPayload(state, steps, needs.clarification);
  }

  // Homepage review flow: propose criteria and place, never search until confirm.
  if (body.reviewOnly === true) return confirmPayload(state, steps);

  // Search immediately when criteria are clear; only width without measure waits.
  if (source === 'local' || state.needs.keys.length) return search(state, env, steps);
  return confirmPayload(state, steps);
}
