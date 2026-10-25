import {
  chatInput,
  answerSchema,
  searchTools,
  toolSchemas,
  searchInstructions,
} from './search-contract.mjs';
import { defaultModel } from './needs-agent.mjs';
import { geocodePlace } from '../geography.mjs';
import { findPractices, validateRequirements } from '../discovery.mjs';
import { createPracticeStore } from '../practice-store.mjs';
import { criteria } from '../core.mjs';
import { collectReviewSources } from './review-sources.mjs';
const encoder = new TextEncoder();
async function signingKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode('accescheck-search-state-v1:' + secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
async function seal(data, secret) {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(JSON.stringify(data)),
  );
  return {
    ...data,
    signature: Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
  };
}
async function restore(state, secret) {
  if (!state)
    return {
      history: [],
      locations: {},
      proposal: null,
      confirmed: false,
      notes: [],
      question: null,
      practiceIds: [],
      autoReviewIds: [],
      lastResults: null,
      page: 1,
      expiresAt: Date.now() + 3600000,
    };
  const { signature, ...data } = state;
  if (
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Date.now() > data.expiresAt ||
    !(await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      Uint8Array.from(signature.match(/../g), (pair) => parseInt(pair, 16)),
      encoder.encode(JSON.stringify(data)),
    ))
  )
    throw new Error('Conversation expirée ou modifiée. Effacez-la pour recommencer.');
  return structuredClone(data);
}
function query(proposal) {
  const value = { ...proposal };
  delete value.id;
  delete value.notes;
  return { ...value, confirmed: true };
}
function searchCriteriaKey({ origin, specialty, needs, radiusKm }) {
  return JSON.stringify([
    origin && [
      origin.latitude,
      origin.longitude,
      origin.cityCode,
      origin.postcode,
      origin.district,
    ],
    specialty,
    [...needs.keys].sort(),
    needs.minWidth,
    radiusKm,
  ]);
}
function resultContext(results) {
  return {
    page: results.page,
    origin: results.origin,
    needs: results.needs,
    practices: results.results.map(
      ({ id, name, address, specialty, sourceUrl, distanceKm, met, needsConfirmation }) => ({
        id,
        name,
        address,
        specialty,
        sourceUrl,
        distanceKm,
        met,
        needsConfirmation,
      }),
    ),
  };
}
function summary(proposal) {
  if (!proposal) return '';
  return [
    proposal.specialty || 'Profession sans préférence',
    proposal.origin
      ? `${proposal.origin.label} · ${proposal.origin.postcode || ''}`
      : 'Sans contrainte géographique',
    proposal.radiusKm === null
      ? 'Rayon sans limite précise'
      : `${proposal.radiusKm} km à vol d’oiseau`,
    ...proposal.needs.keys.map((key) => criteria[key].label),
    proposal.needs.minWidth ? `Passage ≥ ${proposal.needs.minWidth} cm` : '',
    ...proposal.notes,
  ]
    .filter(Boolean)
    .join('\n');
}
export function searchConfig(env = {}) {
  return {
    available: !!env.OPENAI_API_KEY,
    provider: 'OpenAI',
    model: env.OPENAI_SEARCH_MODEL || env.OPENAI_MODEL || defaultModel,
  };
}
export async function runSearchAgent(
  body,
  env = {},
  transport = fetch,
  { signal, emit = () => {} } = {},
) {
  const input = chatInput(body);
  const empty = {
    state: null,
    question: null,
    summary: '',
    notice: '',
    actions: [],
    results: null,
  };
  if (input.action === 'directory') {
    emit({ type: 'status', text: 'Ouverture de l’annuaire public' });
    const results = await findPractices(env.DB, {
      confirmed: true,
      needs: { keys: [], minWidth: null },
      page: input.page || 1,
    });
    return {
      ...empty,
      mode: 'directory',
      reply: 'Annuaire public : aucun besoin ni lieu n’a été interprété.',
      notice: 'Mode dégradé sans agent. Les besoins d’accès restent à vérifier sur chaque fiche.',
      results,
    };
  }
  if (!input.consent || !env.OPENAI_API_KEY)
    return {
      ...empty,
      mode: 'consent',
      state: input.state || null,
      reply: env.OPENAI_API_KEY
        ? 'Votre accord est nécessaire pour envoyer votre demande complète, le lieu et le contexte de cette conversation à OpenAI. Évitez les noms et coordonnées personnels.'
        : 'L’agent OpenAI est indisponible. Vous pouvez consulter l’annuaire public en mode dégradé.',
      actions: [
        ...(env.OPENAI_API_KEY ? [{ id: 'consent', label: 'Accepter et poursuivre' }] : []),
        { id: 'directory', label: 'Consulter l’annuaire public' },
      ],
    };
  const state = await restore(input.state, env.OPENAI_API_KEY);
  state.autoReviewIds ??= state.practiceIds.slice(0, 3);
  if (input.displayedPracticeIds) {
    const rows = state.lastResults?.practices || [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const priority = (row) => JSON.stringify([row.needsConfirmation, row.met, row.distanceKm]);
    const ids = input.displayedPracticeIds;
    if (
      ids.length !== rows.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id, index) => !byId.has(id) || priority(byId.get(id)) !== priority(rows[index]))
    )
      throw new Error('Ordre des fiches invalide. Actualisez la recherche.');
    if (rows.length) {
      state.lastResults.practices = ids.map((id) => byId.get(id));
      state.practiceIds = ids;
    }
  }

  if (input.action === 'page') {
    if (!state.confirmed || !state.proposal)
      throw new Error('Confirmez une recherche avant de changer de page.');
    const results = await findPractices(env.DB, {
      ...query(state.proposal),
      page: input.page || 1,
    });
    return {
      ...empty,
      state: await seal(
        {
          ...state,
          lastResults: resultContext(results),
          page: results.page,
          practiceIds: results.results.map((practice) => practice.id),
        },
        env.OPENAI_API_KEY,
      ),
      summary: summary(state.proposal),
      reply: 'Résultats de la recherche confirmée.',
      results,
    };
  }
  let message = input.message;
  if (input.answer) {
    const option =
      state.question?.id === input.answer.field &&
      state.question.options.find((option) => option.value === input.answer.value);
    if (!option) throw new Error('Ce choix ne correspond plus à la question actuelle.');
    message = option.label;
  }
  if (input.action === 'confirm') {
    if (!state.proposal) throw new Error('Aucune proposition à confirmer.');
    state.confirmed = true;
    message = 'Je confirme exactement ce récapitulatif : ' + summary(state.proposal);
  } else {
    state.confirmed = false;
    state.proposal = null;
    state.notes = [];
  }
  if (!message) throw new Error('Écrivez votre demande.');
  if (state.history.length >= 30)
    throw new Error(
      'Cette conversation a atteint sa limite. Effacez-la avant une nouvelle recherche.',
    );
  state.history.push({ role: 'user', content: message });
  const store = createPracticeStore(env.DB);
  const catalog = await store.catalog();
  const context = {
    locations: state.locations,
    proposal: state.proposal,
    confirmed: state.confirmed,
    reviewConsent: input.reviewConsent === true,
    results: state.lastResults,
    professions: catalog.specialties,
    criteria,
  };
  const history = [
    ...state.history,
    { role: 'developer', content: JSON.stringify({ verifiedContext: context }) },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(55000), ...(signal ? [signal] : [])]);
  let toolsUsed = 0,
    tokensLeft = 8000,
    inputBytesLeft = 160000,
    reviewsUsed = 0,
    results = null;
  const reviews = [];
  const warnings = new Set();
  async function execute(name, args) {
    const schema = Object.hasOwn(toolSchemas, name) ? toolSchemas[name] : null;
    if (!schema) throw new Error('Outil inconnu.');
    const parsed = schema.safeParse(args);
    if (!parsed.success) throw new Error('Arguments de l’outil invalides.');
    const value = parsed.data;
    if (name === 'geocode_place') {
      emit({ type: 'status', text: 'Recherche géographique IGN' });
      const places = await geocodePlace(value, (url, options) =>
        transport(url, { ...options, signal: AbortSignal.any([options.signal, deadline]) }),
      );
      if (Object.keys(state.locations).length + places.length > 20)
        throw new Error('Trop de lieux étudiés. Demandez une précision.');
      return places.map((place) => {
        const ref = crypto.randomUUID();
        state.locations[ref] = place;
        return { ref, ...place };
      });
    }
    if (name === 'prepare_search') {
      if (state.confirmed && !results)
        throw new Error(
          'Cette recherche est déjà confirmée. Utilisez search_practices avec la proposition confirmée, sans la préparer à nouveau.',
        );
      const origin =
        value.locationRef && Object.hasOwn(state.locations, value.locationRef)
          ? state.locations[value.locationRef]
          : null;
      if (value.locationRef && !origin) throw new Error('Lieu non vérifié par IGN.');
      if (value.radiusKm !== null && !origin)
        throw new Error('Un rayon nécessite un point IGN vérifié.');
      if (value.specialty && !catalog.specialties.includes(value.specialty))
        throw new Error('Profession absente du catalogue.');
      validateRequirements(value.needs);
      if (value.needs.minWidth !== null && !value.needs.keys.includes('width'))
        throw new Error('La largeur nécessite le critère passage large.');
      const proposal = {
        origin,
        specialty: value.specialty || '',
        needs: value.needs,
        radiusKm: value.radiusKm,
        notes: value.notes,
      };
      if (state.confirmed && searchCriteriaKey(state.proposal) === searchCriteriaKey(proposal))
        return {
          proposalId: state.proposal.id,
          summary: summary(state.proposal),
          requiresUserConfirmation: false,
        };
      results = null;
      state.practiceIds = [];
      state.autoReviewIds = [];
      state.lastResults = null;
      reviews.length = 0;
      state.proposal = { id: crypto.randomUUID(), ...proposal };
      state.notes = value.notes;
      state.confirmed = false;
      return {
        proposalId: state.proposal.id,
        summary: summary(state.proposal),
        requiresUserConfirmation: true,
      };
    }
    if (name === 'search_practices') {
      if (!state.confirmed || state.proposal?.id !== value.proposalId)
        throw new Error('Le patient doit confirmer cette proposition avant la recherche.');
      emit({ type: 'status', text: 'Recherche des cabinets dans Accès Libre' });
      results = await findPractices(env.DB, query(state.proposal));
      state.lastResults = resultContext(results);
      state.page = 1;
      state.practiceIds = results.results.map((practice) => practice.id);
      state.autoReviewIds = state.practiceIds.slice(0, 3);
      return results;
    }
    if (!state.practiceIds.includes(value.practiceId))
      throw new Error('Consultez uniquement une fiche issue des résultats vérifiés.');
    if (name === 'read_practice') {
      emit({ type: 'status', text: 'Consultation des preuves de la fiche' });
      return await store.get(value.practiceId);
    }
    if (state.page !== 1 || !state.autoReviewIds.includes(value.practiceId))
      throw new Error('Les avis de cette fiche nécessitent une demande depuis son bouton dédié.');
    if (input.reviewConsent !== true)
      throw new Error('Un accord distinct est nécessaire pour consulter les avis.');
    if (reviewsUsed++ >= 1) throw new Error('Limite de recherche web atteinte pour ce tour.');
    emit({ type: 'status', text: 'Recherche web sur l’identité publique du cabinet' });
    const result = await collectReviewSources(
      { practiceId: value.practiceId, consent: true },
      env,
      transport,
      deadline,
    );
    reviews.push(result);
    return result;
  }
  // Function outputs and reasoning items stay together: https://developers.openai.com/api/docs/guides/function-calling
  for (let step = 0; step < 7 && tokensLeft >= 1000; step++) {
    deadline.throwIfAborted();
    if (JSON.stringify(history).length > 120000)
      throw new Error('Contexte trop volumineux. Précisez votre recherche.');
    emit({ type: 'status', text: 'L’agent OpenAI examine votre demande' });
    const options = {
      method: 'POST',
      redirect: 'error',
      signal: deadline,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: searchConfig(env).model,
        store: false,
        instructions: searchInstructions,
        input: history,
        tools: searchTools,
        parallel_tool_calls: false,
        include: ['reasoning.encrypted_content'],
        reasoning: { effort: 'medium' },
        max_output_tokens: Math.min(2400, tokensLeft),
        text: {
          format: {
            type: 'json_schema',
            name: 'search_answer',
            strict: true,
            schema: answerSchema.toJSONSchema(),
          },
        },
      }),
    };
    inputBytesLeft -= encoder.encode(options.body).length;
    if (inputBytesLeft < 0)
      throw new Error('Limite de contexte de recherche atteinte. Précisez votre demande.');
    let response;
    try {
      response = await transport('https://api.openai.com/v1/responses', options);
    } catch {
      deadline.throwIfAborted();
      throw new Error('L’agent est injoignable. Réessayez ou ouvrez l’annuaire public.');
    }
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'Limite OpenAI atteinte. Réessayez plus tard ou ouvrez l’annuaire public.'
          : 'L’agent OpenAI est indisponible. Réessayez ou ouvrez l’annuaire public.',
      );
    const data = await response.json();
    if (
      data.status !== 'completed' ||
      !Array.isArray(data.output) ||
      JSON.stringify(data.output).length > 120000
    )
      throw new Error('Réponse de l’agent incomplète. Réessayez votre demande.');
    const used = data.usage?.output_tokens;
    tokensLeft -= Number.isInteger(used) && used > 0 ? Math.min(used, 2400) : 2400;
    history.push(...data.output);
    const calls = data.output.filter((item) => item.type === 'function_call');
    if (calls.length) {
      for (const call of calls) {
        if (++toolsUsed > 8) throw new Error('Limite d’outils atteinte. Précisez votre recherche.');
        let output;
        try {
          output = await execute(call.name, JSON.parse(call.arguments));
        } catch (error) {
          deadline.throwIfAborted();
          warnings.add(error.message);
          output = { error: error.message };
        }
        history.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(output),
        });
      }
      continue;
    }
    let answer;
    try {
      answer = answerSchema.parse(
        JSON.parse(
          data.output
            .flatMap((item) => item.content || [])
            .filter((part) => part.type === 'output_text')
            .map((part) => part.text)
            .join(''),
        ),
      );
    } catch {
      throw new Error('La réponse de l’agent n’a pas pu être vérifiée. Réessayez.');
    }
    if (state.confirmed && !results)
      throw new Error(
        'La recherche confirmée n’a pas été exécutée par l’agent. Réessayez pour lancer cette même recherche.',
      );
    const awaitingConfirmation = Boolean(state.proposal && !state.confirmed);
    if (awaitingConfirmation) {
      answer.question = null;
      answer.reply =
        'Vérifiez ces critères, puis confirmez pour lancer la recherche. Vous pouvez les corriger dans votre message.';
    }
    state.question = answer.question;
    if (answer.question) {
      answer.question.options = answer.question.options.filter(
        (option) => !['__free__', '__unknown__'].includes(option.value),
      );
      answer.question.options.push(
        { label: 'Saisir ma réponse', value: '__free__' },
        { label: 'Je ne sais pas', value: '__unknown__' },
      );
    }
    state.history.push({
      role: 'assistant',
      content: JSON.stringify({ ...answer, summary: summary(state.proposal) }),
    });
    return {
      ...empty,
      ...answer,
      notice: [...warnings].join(' '),
      state: await seal(state, env.OPENAI_API_KEY),
      summary: summary(state.proposal),
      actions: awaitingConfirmation ? [{ id: 'confirm', label: 'Confirmer et chercher' }] : [],
      results,
      reviews,
      mode: 'agent',
    };
  }
  throw new Error(
    'Limite de recherche atteinte. Précisez votre demande ; aucune recherche supplémentaire n’a été lancée.',
  );
}
