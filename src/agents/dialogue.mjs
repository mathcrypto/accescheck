import { parseNeeds } from '../core.mjs';
import { createPracticeStore } from '../practice-store.mjs';
import { findPractices, geocode } from '../discovery.mjs';
import { matchSpecialty, extractPlaceQuery } from './finder.mjs';
import { interpretNeeds } from './needs-agent.mjs';
import { dialogueInput, answered, nextQuestion, dialogueSummary } from './dialogue-state.mjs';
const plain = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const NO_PLACE = /sans (?:contrainte geographique|limite geographique)|partout en france/;
const NO_ACCESS = /pas de contrainte|aucun besoin|sans besoin particulier/;
const UNKNOWN = /^(?:je ne sais pas|inconnu|__unknown__)$/;
function note(state, text) {
  state.notes = [...new Set([...state.notes, text.slice(0, 300)])].slice(-5);
}
function payload(state, specialties, notice = '') {
  const question = nextQuestion(state, specialties);
  state.pending = question?.id || null;
  return {
    state,
    question,
    summary: dialogueSummary(state),
    notice,
    reply:
      question?.text ||
      'Vérifiez ce récapitulatif, puis confirmez la recherche. Vous pouvez aussi corriger un détail dans le chat.',
    actions: question ? [] : [{ id: 'confirm', label: 'Confirmer et chercher' }],
    results: null,
  };
}
async function locate(state, query, transport) {
  state.origin = null;
  state.placeQuery = query;
  state.answered = state.answered.filter((field) => field !== 'place');
  state.locationChoices = await geocode(query, transport);
  return state.locationChoices.length
    ? ''
    : 'Aucun lieu trouvé par IGN. Précisez le lieu ou continuez sans localisation.';
}
function applyNeeds(state, parsed, text) {
  const t = plain(text);
  const groups = [
    ['fauteuil|wheelchair|deambulateur', ['stepFree', 'route', 'width']],
    ['largeur|passage', ['width']],
    ['sans marche|plain.pied', ['stepFree', 'route']],
    ['sourd|malentendant|equipement auditif|boucle', ['hearing']],
    ['signaletique|canne blanche|malvoyant|aveugle', ['signage']],
    ['lsf|langue des signes', ['signLanguage']],
    ['sanitaires|toilettes', ['toilets']],
    ['communication|echange ecrit', ['communication']],
    ['amenagements sensoriels|calme', ['sensory']],
  ];
  const removed = new Set();
  for (const [pattern, keys] of groups) {
    const denial = new RegExp(
      "(?:pas|plus|retire|enleve|supprime)\\s+(?:(?:en|de|un|une|le|la|besoin|d['’])\\s*)*(?:" +
        pattern +
        ')',
    );
    if (denial.test(t)) keys.forEach((key) => removed.add(key));
  }
  const previous = state.needs.keys.filter((key) => !removed.has(key));
  const explicitWritten = /echange ecrit|par ecrit|outil de communication/.test(t);
  const explicitLSF = /\blsf\b|langue des signes/.test(t);
  const explicitEquipment = /equipement auditif|boucle/.test(t);
  let keys = parsed.keys;
  if ((explicitWritten || explicitLSF) && !explicitEquipment)
    keys = keys.filter((key) => key !== 'hearing');
  const addedWidth = keys.includes('width') && !previous.includes('width');
  state.needs = {
    keys: [...new Set([...previous, ...keys.filter((key) => !removed.has(key))])],
    minWidth: parsed.minWidth ?? state.needs.minWidth,
  };
  if (!state.needs.keys.includes('width')) state.needs.minWidth = null;
  if (keys.length || removed.size) answered(state, 'access');
  if (addedWidth) state.answered = state.answered.filter((field) => field !== 'width');
  if (state.needs.minWidth !== null) answered(state, 'width');
  if (explicitWritten || explicitLSF || explicitEquipment) answered(state, 'communication');
  else if (
    /communication adaptee|malentendant|sourd|besoin auditif/.test(t) &&
    !removed.has('hearing')
  )
    state.communicationPrompt = true;
  if (/signaletique/.test(t) && !removed.has('signage')) answered(state, 'vision');
  else if (/canne blanche|aveugle|malvoyant/.test(t) && !removed.has('signage'))
    state.visionPrompt = true;
  if (/transfert|table de consultation|aide (?:humaine|a l.orientation)/.test(t)) {
    note(
      state,
      /transfert/.test(t) ? 'Aide au transfert' : 'Aide à l’orientation ou à la consultation',
    );
    answered(state, 'access');
  }
}
export async function runDialogue(
  body,
  env = {},
  transport = fetch,
  { signal, emit = () => {} } = {},
) {
  signal?.throwIfAborted();
  const upstream = transport;
  transport = (url, options = {}) => {
    signal?.throwIfAborted();
    const host = new URL(url).hostname;
    if (host === 'api.openai.com') emit({ type: 'status', text: 'OpenAI propose les critères' });
    if (host === 'data.geopf.fr')
      emit({ type: 'status', text: 'Je recherche le lieu auprès d’IGN' });
    return upstream(url, {
      ...options,
      ...(signal
        ? { signal: AbortSignal.any([signal, ...(options.signal ? [options.signal] : [])]) }
        : {}),
    });
  };
  emit({ type: 'status', text: 'Je précise votre recherche' });
  const input = dialogueInput(body);
  const state = input.state;
  const { specialties } = await createPracticeStore(env.DB).catalog();
  if (state.specialty && !specialties.includes(state.specialty))
    throw new Error('Cette profession ne figure pas dans le catalogue.');
  if (input.action === 'clear')
    return { state: null, question: null, reply: '', actions: [], results: null };
  if (input.action === 'confirm' || input.action === 'page') {
    if (nextQuestion(state, specialties))
      throw new Error('Répondez à la question en cours avant de confirmer.');
    emit({ type: 'status', text: 'Je cherche les cabinets' });
    const results = await findPractices(env.DB, {
      confirmed: true,
      needs: state.needs,
      specialty: state.specialty,
      origin: state.origin,
      radiusKm: state.origin ? state.radiusKm : null,
      page: input.page || 1,
    });
    return {
      ...payload(state, specialties),
      reply: results.total
        ? 'Voici les fiches correspondant aux critères confirmés. Corrigez votre demande ici pour affiner la recherche.'
        : 'Aucune fiche sans obstacle connu pour ces critères. Vous pouvez élargir le rayon ou modifier votre recherche.',
      actions: [],
      results,
    };
  }
  const current = nextQuestion(state, specialties);
  if (input.answer && (!current || current.id !== input.answer.field))
    throw new Error(
      'Ce choix appartient à une question précédente. Répondez à la question actuelle.',
    );
  const field = input.answer?.field || state.pending;
  const text = input.message || input.answer.value;
  const t = plain(text);
  let notice = '';
  if (UNKNOWN.test(t) || text === '__none__') {
    if (!field) throw new Error('Aucune question à compléter.');
    const key = field === 'location' ? 'place' : field;
    answered(state, key, UNKNOWN.test(t));
    if (key === 'place') {
      state.origin = null;
      state.placeQuery = '';
      state.locationChoices = [];
    }
    if (key === 'radius') state.radiusKm = null;
    if (key === 'width') state.needs.minWidth = null;
    if (key === 'communication')
      state.needs.keys = state.needs.keys.filter(
        (criterion) => !['hearing', 'communication'].includes(criterion),
      );
    if (key === 'vision')
      state.needs.keys = state.needs.keys.filter((criterion) => criterion !== 'signage');
    if (
      ['communication', 'vision'].includes(key) &&
      !state.needs.keys.length &&
      !state.notes.length
    )
      answered(state, 'access', true);
    return payload(state, specialties);
  }
  if (input.answer?.field === 'location') {
    if (!/^\d$/.test(text) || !state.locationChoices[Number(text)])
      throw new Error('Lieu proposé invalide.');
    state.origin = state.locationChoices[Number(text)];
    state.locationChoices = [];
    answered(state, 'place');
    return payload(state, specialties);
  }
  if (field === 'radius' && /^(?:\d+(?:[.,]\d+)?)(?:\s*km)?$/.test(t)) {
    const radius = Number(t.replace(/\s*km$/, '').replace(',', '.'));
    if (radius < 0.1 || radius > 50)
      throw new Error('Rayon attendu : entre 0,1 et 50 km, ou sans limite.');
    state.radiusKm = radius;
    answered(state, 'radius');
    return payload(state, specialties);
  }
  if (field === 'width') {
    const value = /^\d+(?:[.,]\d+)?$/.test(t) ? t + ' cm' : text;
    const parsed = parseNeeds(value);
    if (parsed.minWidth !== null) {
      state.needs.minWidth = parsed.minWidth;
      answered(state, 'width');
      return payload(state, specialties);
    }
  }
  if (field === 'communication' && ['communication', 'hearing', 'signLanguage'].includes(text)) {
    state.needs.keys = [
      ...state.needs.keys.filter((key) => !['hearing', 'communication'].includes(key)),
      text,
    ];
    state.needs.keys = [...new Set(state.needs.keys)];
    answered(state, 'communication');
    return payload(state, specialties);
  }
  if (field === 'vision' && ['signage', 'orientation'].includes(text)) {
    if (text === 'orientation') {
      state.needs.keys = state.needs.keys.filter((key) => key !== 'signage');
      note(state, 'Aide humaine à l’orientation');
    }
    answered(state, 'vision');
    return payload(state, specialties);
  }
  const specialty = matchSpecialty(text, specialties);
  if (specialty) {
    state.specialty = specialty;
    answered(state, 'specialty');
  } else if (field === 'specialty' && input.answer)
    return payload(state, specialties, 'Cette profession n’est pas disponible dans le catalogue.');
  const noPlace = NO_PLACE.test(t);
  if (noPlace) {
    state.origin = null;
    state.placeQuery = '';
    state.locationChoices = [];
    answered(state, 'place');
  }
  if (NO_ACCESS.test(t)) {
    state.needs = { keys: [], minWidth: null };
    state.notes = [];
    state.communicationPrompt = false;
    state.visionPrompt = false;
    answered(state, 'access');
  } else {
    let parsed = parseNeeds(text);
    if (/passage large/.test(t))
      parsed = { ...parsed, keys: [...new Set([...parsed.keys, 'width'])] };
    if (/communication adaptee|echange ecrit/.test(t))
      parsed = { ...parsed, keys: [...new Set([...parsed.keys, 'communication'])] };
    if (
      input.consent &&
      env.OPENAI_API_KEY &&
      !input.answer &&
      !['place', 'location', 'radius', 'width'].includes(field)
    ) {
      try {
        parsed = await interpretNeeds({ description: text, consent: true }, env, transport);
        state.source = 'openai';
      } catch {
        notice =
          'OpenAI indisponible ou message non transmissible. Je poursuis avec les règles locales ; vérifiez le récapitulatif.';
        state.source = 'local';
      }
    }
    if (
      field === 'communication' &&
      parsed.keys.some((key) => ['communication', 'hearing', 'signLanguage'].includes(key))
    )
      state.needs.keys = state.needs.keys.filter(
        (key) => !['hearing', 'communication'].includes(key),
      );
    applyNeeds(state, parsed, text);
    if (
      field === 'communication' &&
      parsed.keys.some((key) => ['communication', 'hearing', 'signLanguage'].includes(key))
    )
      answered(state, 'communication');
    if (field === 'vision' && (parsed.keys.includes('signage') || /orientation/.test(t)))
      answered(state, 'vision');
    if (field === 'access' && !parsed.keys.length && !specialty && !state.notes.length) {
      note(state, text);
      answered(state, 'access');
    }
  }
  const radius = t.match(/(?:rayon(?: de)?\s*|dans (?:un rayon de )?)(\d+(?:[.,]\d+)?)\s*km\b/);
  if (radius) {
    const value = Number(radius[1].replace(',', '.'));
    if (value < 0.1 || value > 50) throw new Error('Rayon attendu : entre 0,1 et 50 km.');
    state.radiusKm = value;
    answered(state, 'radius');
  }
  if (/sans limite/.test(t) && !noPlace) {
    state.radiusKm = null;
    answered(state, 'radius');
  }
  const explicitPlace =
    /\ba (?!un\b|une\b|l.accueil\b|l.orientation\b|la communication\b)|autour|pres de|quartier|\b\d{5}\b|paris|bastille|denfert/.test(
      t,
    );
  const query =
    !noPlace && (['place', 'location'].includes(field) || explicitPlace)
      ? ['place', 'location'].includes(field) && !explicitPlace
        ? text
        : extractPlaceQuery(text) || text
      : '';
  if (query && query !== state.placeQuery) {
    try {
      notice = (await locate(state, query.slice(0, 200), transport)) || notice;
    } catch {
      notice = 'IGN est indisponible. Réessayez le lieu ou continuez sans localisation.';
      state.locationChoices = [];
    }
  }
  return payload(state, specialties, notice);
}
