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
import { getTranslator } from '../i18n-core.mjs';
const encoder = new TextEncoder();
const specialtyKeys = {
  'Médecin généraliste': 'generalPractitioner',
  'Dentiste, chirurgien dentiste': 'dentist',
  Kinésithérapeute: 'physiotherapist',
};
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
async function restore(state, secret, t) {
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
    throw new Error(t('search.errors.expired'));
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
function summary(proposal, t = getTranslator()) {
  if (!proposal) return '';
  const specialty = Object.hasOwn(specialtyKeys, proposal.specialty)
    ? specialtyKeys[proposal.specialty]
    : null;
  return [
    specialty
      ? t(`results.specialties.${specialty}`)
      : proposal.specialty || t('search.recap.noProfession'),
    proposal.origin
      ? `${proposal.origin.label} · ${proposal.origin.postcode || ''}`
      : t('search.recap.noLocation'),
    proposal.radiusKm === null
      ? t('search.recap.noRadius')
      : t('search.recap.radius', { radius: proposal.radiusKm }),
    ...proposal.needs.keys.map((key) => t(`criteria.${key}`)),
    proposal.needs.minWidth ? t('search.recap.width', { width: proposal.needs.minWidth }) : '',
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
  const t = getTranslator(input.lang);
  const empty = {
    state: null,
    question: null,
    summary: '',
    notice: '',
    actions: [],
    results: null,
  };
  if (input.action === 'directory') {
    emit({ type: 'status', text: t('search.status.directory') });
    const results = await findPractices(
      env.DB,
      {
        confirmed: true,
        needs: { keys: [], minWidth: null },
        page: input.page || 1,
      },
      input.lang,
    );
    return {
      ...empty,
      mode: 'directory',
      reply: t('search.directory.reply'),
      notice: t('search.directory.notice'),
      results,
    };
  }
  if (!input.consent || !env.OPENAI_API_KEY)
    return {
      ...empty,
      mode: 'consent',
      state: input.state || null,
      reply: env.OPENAI_API_KEY ? t('search.consent.required') : t('search.consent.unavailable'),
      actions: [
        ...(env.OPENAI_API_KEY ? [{ id: 'consent', label: t('search.actions.consent') }] : []),
        { id: 'directory', label: t('search.actions.directory') },
      ],
    };
  const state = await restore(input.state, env.OPENAI_API_KEY, t);
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
      throw new Error(t('search.errors.cardOrder'));
    if (rows.length) {
      state.lastResults.practices = ids.map((id) => byId.get(id));
      state.practiceIds = ids;
    }
  }

  if (input.action === 'page') {
    if (!state.confirmed || !state.proposal) throw new Error(t('search.errors.confirmBeforePage'));
    const results = await findPractices(
      env.DB,
      {
        ...query(state.proposal),
        page: input.page || 1,
      },
      input.lang,
    );
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
      summary: summary(state.proposal, t),
      reply: t('search.results.reply'),
      results,
    };
  }
  let message = input.message;
  if (input.answer) {
    const option =
      state.question?.id === input.answer.field &&
      state.question.options.find((option) => option.value === input.answer.value);
    if (!option) throw new Error(t('search.errors.staleChoice'));
    message = option.label;
  }
  if (input.action === 'confirm') {
    if (!state.proposal) throw new Error(t('search.errors.noProposal'));
    state.confirmed = true;
    message = t('search.confirmation.message', { summary: summary(state.proposal, t) });
  } else {
    state.confirmed = false;
    state.proposal = null;
    state.notes = [];
  }
  if (!message) throw new Error(t('search.errors.empty'));
  if (state.history.length >= 30) throw new Error(t('search.errors.historyLimit'));
  state.history.push({ role: 'user', content: message });
  const store = createPracticeStore(env.DB);
  const catalog = await store.catalog();
  const context = {
    locations: state.locations,
    proposal: state.proposal,
    confirmed: state.confirmed,
    reviewConsent: input.reviewConsent === true,
    language: input.lang || 'fr',
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
    if (!schema) throw new Error(t('search.errors.unknownTool'));
    const parsed = schema.safeParse(args);
    if (!parsed.success) throw new Error(t('search.errors.invalidTool'));
    const value = parsed.data;
    if (name === 'geocode_place') {
      emit({ type: 'status', text: t('search.status.geography') });
      const places = await geocodePlace(
        value,
        (url, options) =>
          transport(url, { ...options, signal: AbortSignal.any([options.signal, deadline]) }),
        input.lang,
      );
      if (Object.keys(state.locations).length + places.length > 20)
        throw new Error(t('search.errors.locationLimit'));
      return places.map((place) => {
        const ref = crypto.randomUUID();
        state.locations[ref] = place;
        return { ref, ...place };
      });
    }
    if (name === 'prepare_search') {
      if (state.confirmed && !results) throw new Error(t('search.errors.alreadyConfirmed'));
      const origin =
        value.locationRef && Object.hasOwn(state.locations, value.locationRef)
          ? state.locations[value.locationRef]
          : null;
      if (value.locationRef && !origin) throw new Error(t('search.errors.unverifiedLocation'));
      if (value.radiusKm !== null && !origin) throw new Error(t('search.errors.radiusLocation'));
      if (value.specialty && !catalog.specialties.includes(value.specialty))
        throw new Error(t('search.errors.profession'));
      validateRequirements(value.needs, input.lang);
      if (value.needs.minWidth !== null && !value.needs.keys.includes('width'))
        throw new Error(t('search.errors.width'));
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
          summary: summary(state.proposal, t),
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
        summary: summary(state.proposal, t),
        requiresUserConfirmation: true,
      };
    }
    if (name === 'search_practices') {
      if (!state.confirmed || state.proposal?.id !== value.proposalId)
        throw new Error(t('search.errors.confirmBeforeSearch'));
      emit({ type: 'status', text: t('search.status.searching') });
      results = await findPractices(env.DB, query(state.proposal), input.lang);
      state.lastResults = resultContext(results);
      state.page = 1;
      state.practiceIds = results.results.map((practice) => practice.id);
      state.autoReviewIds = state.practiceIds.slice(0, 3);
      return results;
    }
    if (!state.practiceIds.includes(value.practiceId))
      throw new Error(t('search.errors.resultScope'));
    if (name === 'read_practice') {
      emit({ type: 'status', text: t('search.status.evidence') });
      return await store.get(value.practiceId);
    }
    if (state.page !== 1 || !state.autoReviewIds.includes(value.practiceId))
      throw new Error(t('search.errors.reviewScope'));
    if (input.reviewConsent !== true) throw new Error(t('search.errors.reviewConsent'));
    if (reviewsUsed++ >= 1) throw new Error(t('search.errors.reviewLimit'));
    emit({ type: 'status', text: t('search.status.reviews') });
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
    if (JSON.stringify(history).length > 120000) throw new Error(t('search.errors.contextSize'));
    emit({ type: 'status', text: t('search.status.thinking') });
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
    if (inputBytesLeft < 0) throw new Error(t('search.errors.contextLimit'));
    let response;
    try {
      response = await transport('https://api.openai.com/v1/responses', options);
    } catch {
      deadline.throwIfAborted();
      throw new Error(t('search.errors.unreachable'));
    }
    if (!response.ok)
      throw new Error(
        response.status === 429 ? t('search.errors.rateLimit') : t('search.errors.unavailable'),
      );
    const data = await response.json();
    if (
      data.status !== 'completed' ||
      !Array.isArray(data.output) ||
      JSON.stringify(data.output).length > 120000
    )
      throw new Error(t('search.errors.incomplete'));
    const used = data.usage?.output_tokens;
    tokensLeft -= Number.isInteger(used) && used > 0 ? Math.min(used, 2400) : 2400;
    history.push(...data.output);
    const calls = data.output.filter((item) => item.type === 'function_call');
    if (calls.length) {
      for (const call of calls) {
        if (++toolsUsed > 8) throw new Error(t('search.errors.toolLimit'));
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
      throw new Error(t('search.errors.unverifiedReply'));
    }
    if (state.confirmed && !results) throw new Error(t('search.errors.unexecuted'));
    const awaitingConfirmation = Boolean(state.proposal && !state.confirmed);
    if (awaitingConfirmation) {
      answer.question = null;
      answer.reply = t('search.confirmation.required');
    }
    state.question = answer.question;
    if (answer.question) {
      answer.question.options = answer.question.options.filter(
        (option) => !['__free__', '__unknown__'].includes(option.value),
      );
      answer.question.options.push(
        { label: t('search.actions.typeAnswer'), value: '__free__' },
        { label: t('search.actions.unknown'), value: '__unknown__' },
      );
    }
    state.history.push({
      role: 'assistant',
      content: JSON.stringify({ ...answer, summary: summary(state.proposal, t) }),
    });
    return {
      ...empty,
      ...answer,
      notice: [...warnings].join(' '),
      state: await seal(state, env.OPENAI_API_KEY),
      summary: summary(state.proposal, t),
      actions: awaitingConfirmation ? [{ id: 'confirm', label: t('search.actions.confirm') }] : [],
      results,
      reviews,
      mode: 'agent',
    };
  }
  throw new Error(t('search.errors.searchLimit'));
}
