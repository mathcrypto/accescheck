import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchAgent, searchConfig } from '../src/agents/search-agent.mjs';
import { createTestDatabase } from './helpers/database.mjs';
const db = await createTestDatabase();
test.after(() => db.close());
test('without consent the complete request stays local and no deterministic questions run', async () => {
  let calls = 0;
  const result = await runSearchAgent(
    { message: 'Un dentiste à Lyon 3e', consent: false },
    { DB: db, OPENAI_API_KEY: 'test-key' },
    async () => {
      calls++;
      throw Error('Forbidden');
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.question, null);
  assert.equal(result.results, null);
  assert.match(result.reply, /accord/);
  assert.ok(result.actions.some((action) => action.id === 'consent'));
});
test('the explicitly chosen local directory never interprets the patient message', async () => {
  const result = await runSearchAgent(
    { message: 'Un dentiste à Lyon 3e', action: 'directory', consent: false },
    { DB: db },
    () => {
      throw Error('No remote call');
    },
  );
  assert.equal(result.mode, 'directory');
  assert.equal(result.question, null);
  assert.equal(result.results.origin, null);
  assert.deepEqual(result.results.needs.keys, []);
  assert.match(result.notice, /dégradé/);
});
const complete = (value) =>
  Response.json({
    status: 'completed',
    usage: { output_tokens: 100 },
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(value) }],
      },
    ],
  });
const call = (name, args) =>
  Response.json({
    status: 'completed',
    usage: { output_tokens: 100 },
    output: [
      { type: 'reasoning', id: 'reasoning-1', encrypted_content: 'opaque', summary: [] },
      {
        type: 'function_call',
        call_id: crypto.randomUUID(),
        name,
        arguments: JSON.stringify(args),
      },
    ],
  });
const env = { DB: db, OPENAI_API_KEY: 'test-key' };
const place = (city, district) => ({
  query: `${city} ${district}e`,
  city,
  cityCode: null,
  postcode: null,
  district,
  kind: 'municipality',
});
const feature = (city, district, code, postcode) => ({
  geometry: { coordinates: [4.87, 45.75] },
  properties: {
    label: `${city} ${district}e Arrondissement`,
    name: `${city} ${district}e Arrondissement`,
    city,
    citycode: code,
    postcode,
    type: 'municipality',
    id: code,
  },
});
const toolOutput = (body) => JSON.parse(body.input.at(-1).output);
for (const [city, district, code, postcode] of [
  ['Lyon', 3, '69383', '69003'],
  ['Paris', 14, '75114', '75014'],
  ['Marseille', 8, '13208', '13008'],
])
  test(`agent-selected IGN tool preserves ${city} ${district}e with full context and verified references`, async () => {
    let round = 0;
    const transport = async (url, options) => {
      if (new URL(url).hostname === 'data.geopf.fr')
        return Response.json({
          features: [
            feature(city, district, code, postcode),
            feature('Lille', 3, '59350', '59000'),
          ],
        });
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.model, 'gpt-5.4-mini');
      if (round++ === 0) {
        assert.ok(JSON.stringify(body.input).includes(`Un dentiste à ${city} ${district}e`));
        return call('geocode_place', place(city, district));
      }
      assert.ok(
        body.input.some((item) => item.type === 'reasoning' && item.encrypted_content === 'opaque'),
      );
      const locations = toolOutput(body);
      assert.equal(locations.length, 1);
      assert.equal(locations[0].postcode, postcode);
      return complete({
        reply: 'Quel rayon vous conviendrait ?',
        question: {
          id: 'rayon-utile',
          text: 'Quel rayon ?',
          options: [{ label: '3 km', value: '3km' }],
        },
      });
    };
    const result = await runSearchAgent(
      { message: `Un dentiste à ${city} ${district}e`, consent: true },
      env,
      transport,
    );
    assert.equal(Object.values(result.state.locations)[0].cityCode, code);
    assert.equal(result.question.id, 'rayon-utile');
    assert.ok(result.question.options.some((option) => option.value === '__unknown__'));
    assert.equal(result.results, null);
  });
test('agent may reformulate after inconsistent geography; server never offers those results', async () => {
  let step = 0;
  const transport = async (url, options) => {
    if (new URL(url).hostname === 'data.geopf.fr')
      return Response.json({
        features:
          step === 1
            ? [feature('Lille', 3, '59350', '59000')]
            : [feature('Lyon', 3, '69383', '69003')],
      });
    const body = JSON.parse(options.body);
    if (step++ === 0) return call('geocode_place', place('Lyon', 3));
    if (step === 2) {
      assert.deepEqual(toolOutput(body), []);
      return call('geocode_place', { ...place('Lyon', 3), postcode: '69003' });
    }
    assert.equal(toolOutput(body)[0].postcode, '69003');
    return complete({
      reply: 'Quel rayon ?',
      question: { id: 'distance', text: 'Quel rayon ?', options: [] },
    });
  };
  const result = await runSearchAgent(
    { message: 'Un dentiste à Lyon 3e', consent: true },
    env,
    transport,
  );
  assert.equal(Object.values(result.state.locations).length, 1);
});
test('model cannot forge a geographic reference or bypass real patient confirmation', async () => {
  let step = 0;
  const transport = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (step++ === 0)
      return call('prepare_search', {
        locationRef: 'invented',
        specialty: null,
        needs: { keys: [], minWidth: null },
        radiusKm: 3,
        notes: [],
      });
    if (step === 2) {
      assert.match(toolOutput(body).error, /IGN/);
      return call('search_practices', { proposalId: 'invented' });
    }
    assert.match(toolOutput(body).error, /confirmer/);
    return complete({
      reply: 'Précisez le lieu.',
      question: { id: 'lieu', text: 'Quel lieu ?', options: [] },
    });
  };
  const result = await runSearchAgent({ message: 'Cherche à Lyon', consent: true }, env, transport);
  assert.equal(result.results, null);
  await assert.rejects(
    runSearchAgent(
      { action: 'confirm', consent: true, state: { ...result.state, confirmed: true } },
      env,
      transport,
    ),
    /modifiée/,
  );
});
test('a correction carries the conversation but invalidates the old confirmed criteria', async () => {
  let round = 0;
  const first = await runSearchAgent(
    { message: 'Un dentiste à Lyon 3e', consent: true },
    env,
    async () =>
      complete({
        reply: 'Quel rayon ?',
        question: { id: 'rayon', text: 'Quel rayon ?', options: [] },
      }),
  );
  const second = await runSearchAgent(
    { message: 'Finalement Marseille 8e', state: first.state, consent: true },
    env,
    async (_url, options) => {
      const body = JSON.parse(options.body);
      round++;
      assert.ok(JSON.stringify(body.input).includes('Un dentiste à Lyon 3e'));
      assert.ok(JSON.stringify(body.input).includes('Finalement Marseille 8e'));
      assert.equal(JSON.parse(body.input.at(-1).content).verifiedContext.confirmed, false);
      return complete({
        reply: 'Marseille 8e est retenu. Quelle distance ?',
        question: { id: 'distance', text: 'Quelle distance ?', options: [] },
      });
    },
  );
  assert.equal(round, 1);
  assert.equal(second.state.proposal, null);
});
test('provider errors and repeated tool calls have visible bounded failures without fallback interpretation', async () => {
  await assert.rejects(
    runSearchAgent(
      { message: 'Lyon', consent: true },
      env,
      async () => new Response('', { status: 429 }),
    ),
    /Limite OpenAI/,
  );
  let calls = 0;
  await assert.rejects(
    runSearchAgent({ message: 'Lyon', consent: true }, env, async () => {
      calls++;
      return call('unknown', {});
    }),
    /Limite de recherche/,
  );
  assert.equal(calls, 7);
});

test('confirmed criteria drive sourced results and pagination; correction requires a new confirmation', async () => {
  const { controlledSearch, controlledGeography } = await import('./helpers/search-agent.mjs');
  const transport = async (url, options) =>
    new URL(url).hostname === 'data.geopf.fr'
      ? controlledGeography(url)
      : controlledSearch(JSON.parse(options.body), {
          needs: { keys: ['stepFree', 'width'], minWidth: null },
        });
  let current = await runSearchAgent(
    {
      message: 'Généraliste sans contrainte géographique, passage large de largeur inconnue',
      consent: true,
    },
    env,
    transport,
  );
  assert.equal(current.state.proposal.needs.minWidth, null);
  assert.match(current.summary, /Largeur/);
  assert.equal(current.results, null);
  current = await runSearchAgent(
    { action: 'confirm', consent: true, state: current.state },
    env,
    transport,
  );
  assert.ok(current.results.total > 0);
  assert.ok(
    current.results.results.every((practice) =>
      practice.sourceUrl.startsWith('https://acceslibre.beta.gouv.fr/'),
    ),
  );
  const paged = await runSearchAgent(
    { action: 'page', page: 1, consent: true, state: current.state },
    env,
    () => {
      throw Error('Pagination should not bill a model');
    },
  );
  assert.equal(paged.results.total, current.results.total);
  const changed = await runSearchAgent(
    { message: 'Finalement sans contrainte géographique', consent: true, state: current.state },
    env,
    transport,
  );
  assert.equal(changed.results, null);
  assert.equal(changed.state.confirmed, false);
});
test('model-selected unknown answers and arbitrary QCM remain context, not fixed business transitions', async () => {
  const { modelAnswer } = await import('./helpers/search-agent.mjs');
  let result = await runSearchAgent(
    { message: 'Je cherche un cabinet', consent: true },
    env,
    async () =>
      modelAnswer('Quel moyen de communication ?', {
        id: 'accommodation-contextuelle',
        text: 'Quel moyen ?',
        options: [{ label: 'Écrit', value: 'written' }],
      }),
  );
  result = await runSearchAgent(
    {
      answer: { field: result.question.id, value: '__unknown__' },
      consent: true,
      state: result.state,
    },
    env,
    async (_url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(
        payload.input.filter((item) => item.role === 'user').at(-1).content,
        'Je ne sais pas',
      );
      return modelAnswer('La communication restera à confirmer.');
    },
  );
  assert.equal(result.question, null);
  assert.equal(result.state.proposal, null);
});
test('invalid criteria and review requests fail at the server boundary', async () => {
  let step = 0;
  const result = await runSearchAgent(
    { message: 'Cherche un cabinet', consent: true },
    env,
    async (_url, options) => {
      const body = JSON.parse(options.body);
      if (step++ === 0)
        return call('prepare_search', {
          locationRef: null,
          specialty: null,
          needs: { keys: ['width'], minWidth: 20 },
          radiusKm: null,
          notes: [],
        });
      if (step === 2) {
        assert.match(toolOutput(body).error, /invalides/);
        return call('research_public_identity', { practiceId: 'invented' });
      }
      assert.match(toolOutput(body).error, /résultats vérifiés/);
      return complete({
        reply: 'Pouvez-vous préciser la largeur ?',
        question: { id: 'largeur', text: 'Quelle largeur ?', options: [] },
      });
    },
  );
  assert.equal(result.results, null);
});
test('a caller abort reaches the actual provider, and no automatic retry occurs', async () => {
  const abort = new AbortController();
  let calls = 0;
  const pending = runSearchAgent(
    { message: 'Un dentiste à Lyon 3e', consent: true },
    env,
    async (_url, options) => {
      calls++;
      assert.equal(options.signal.aborted, false);
      abort.abort();
      options.signal.throwIfAborted();
    },
    { signal: abort.signal },
  );
  await assert.rejects(pending);
  assert.equal(calls, 1);
});
test('a newly prepared proposal clears earlier results and cannot relabel them', async () => {
  const { controlledSearch } = await import('./helpers/search-agent.mjs');
  const first = await runSearchAgent(
    { message: 'Sans contrainte géographique', consent: true },
    env,
    async (_url, options) =>
      controlledSearch(JSON.parse(options.body), { needs: { keys: ['hearing'], minWidth: null } }),
  );
  let step = 0;
  const changed = await runSearchAgent(
    { action: 'confirm', state: first.state, consent: true },
    env,
    async (_url, options) => {
      const body = JSON.parse(options.body);
      if (step++ === 0) return call('search_practices', { proposalId: first.state.proposal.id });
      if (step === 2) {
        assert.ok(toolOutput(body).results.length);
        return call('prepare_search', {
          locationRef: null,
          specialty: null,
          needs: { keys: ['stepFree'], minWidth: null },
          radiusKm: null,
          notes: [],
        });
      }
      return complete({ reply: 'Nouveaux critères à confirmer.', question: null });
    },
  );
  assert.equal(changed.state.confirmed, false);
  assert.equal(changed.results, null);
  assert.deepEqual(changed.state.practiceIds, []);
});
test('withdrawing consent preserves context and accepting again resumes the same QCM answer', async () => {
  const first = await runSearchAgent(
    { message: 'Cherche un cabinet', consent: true },
    env,
    async () =>
      complete({
        reply: 'Précisons.',
        question: {
          id: 'question-libre',
          text: 'Quel besoin ?',
          options: [{ label: 'Écrit', value: 'written' }],
        },
      }),
  );
  let calls = 0;
  const paused = await runSearchAgent(
    { answer: { field: 'question-libre', value: 'written' }, state: first.state, consent: false },
    env,
    async () => {
      calls++;
      throw Error('Forbidden');
    },
  );
  assert.equal(calls, 0);
  assert.deepEqual(paused.state, first.state);
  const resumed = await runSearchAgent(
    { answer: { field: 'question-libre', value: 'written' }, state: paused.state, consent: true },
    env,
    async (_url, options) => {
      assert.equal(
        JSON.parse(options.body)
          .input.filter((item) => item.role === 'user')
          .at(-1).content,
        'Écrit',
      );
      return complete({ reply: 'Échange écrit retenu.', question: null });
    },
  );
  assert.equal(resumed.mode, 'agent');
});
test('automatic agent review research stays inside the consented first three of the first page', async () => {
  const { fixtures } = await import('./helpers/database.mjs');
  const { controlledSearch } = await import('./helpers/search-agent.mjs');
  const database = await createTestDatabase(
    Array.from({ length: 15 }, (_, index) => ({
      ...fixtures[0],
      id: 'scope-' + index,
      name: 'Cabinet ' + String(index).padStart(2, '0'),
    })),
  );
  const config = { ...env, DB: database };
  let reviewCalls = 0;
  try {
    const prepared = await runSearchAgent(
      { message: 'Sans contrainte géographique', consent: true },
      config,
      async (_url, options) => controlledSearch(JSON.parse(options.body)),
    );
    let step = 0;
    const first = await runSearchAgent(
      { action: 'confirm', state: prepared.state, consent: true, reviewConsent: true },
      config,
      async (_url, options) => {
        const body = JSON.parse(options.body);
        if (typeof body.input === 'string') {
          reviewCalls++;
          throw Error('Out of consent scope');
        }
        if (step++ === 0)
          return call('search_practices', { proposalId: prepared.state.proposal.id });
        if (step === 2)
          return call('research_public_identity', { practiceId: toolOutput(body).results[11].id });
        assert.match(toolOutput(body).error, /bouton dédié/);
        return complete({
          reply: 'Les autres avis sont disponibles à la demande.',
          question: null,
        });
      },
    );
    assert.equal(reviewCalls, 0);
    const page = await runSearchAgent(
      { action: 'page', page: 2, state: first.state, consent: true },
      config,
      () => {
        throw Error('No model pagination');
      },
    );
    step = 0;
    await runSearchAgent(
      { message: 'Consulte les avis', state: page.state, consent: true, reviewConsent: true },
      config,
      async (_url, options) => {
        const body = JSON.parse(options.body);
        if (step++ === 0)
          return call('research_public_identity', { practiceId: page.results.results[0].id });
        assert.match(toolOutput(body).error, /bouton dédié/);
        return complete({ reply: 'Utilisez le bouton de cette fiche.', question: null });
      },
    );
    assert.equal(reviewCalls, 0);
  } finally {
    database.close();
  }
});
test('the model receives authoritative result identities on the next turn and can consult their evidence', async () => {
  const { controlledSearch } = await import('./helpers/search-agent.mjs');
  let result = await runSearchAgent(
    { message: 'Sans contrainte géographique', consent: true },
    env,
    async (_url, options) => controlledSearch(JSON.parse(options.body)),
  );
  result = await runSearchAgent(
    { action: 'confirm', consent: true, state: result.state },
    env,
    async (_url, options) => controlledSearch(JSON.parse(options.body)),
  );
  let round = 0;
  const inspected = await runSearchAgent(
    { message: 'Explique les inconnus du premier cabinet', consent: true, state: result.state },
    env,
    async (_url, options) => {
      const body = JSON.parse(options.body);
      if (round++ === 0) {
        const context = JSON.parse(
          body.input.find((item) => item.role === 'developer').content,
        ).verifiedContext;
        assert.equal(context.results.practices[0].id, result.results.results[0].id);
        assert.equal(context.results.page, 1);
        return call('read_practice', { practiceId: context.results.practices[0].id });
      }
      assert.equal(toolOutput(body).id, result.results.results[0].id);
      assert.ok(toolOutput(body).evidence);
      return complete({
        reply: 'Ces informations sont déclaratives et les inconnus restent à confirmer.',
        question: null,
      });
    },
  );
  assert.equal(round, 2);
  assert.equal(inspected.mode, 'agent');
});
test('the model cannot search a valid proposal before the patient clicks confirmation', async () => {
  let round = 0;
  const result = await runSearchAgent(
    { message: 'Sans contrainte géographique', consent: true },
    env,
    async (_url, options) => {
      const body = JSON.parse(options.body);
      if (round++ === 0)
        return call('prepare_search', {
          locationRef: null,
          specialty: null,
          needs: { keys: [], minWidth: null },
          radiusKm: null,
          notes: [],
        });
      if (round === 2) return call('search_practices', { proposalId: toolOutput(body).proposalId });
      assert.match(toolOutput(body).error, /confirmer/);
      return complete({ reply: 'Confirmez les critères pour chercher.', question: null });
    },
  );
  assert.equal(result.results, null);
  assert.ok(result.actions.some((action) => action.id === 'confirm'));
});
for (const reference of ['constructor', '__proto__', 'toString'])
  test('inherited property is never a verified IGN reference: ' + reference, async () => {
    let round = 0;
    const result = await runSearchAgent(
      { message: 'Cherche un cabinet', consent: true },
      env,
      async (_url, options) => {
        if (round++ === 0)
          return call('prepare_search', {
            locationRef: reference,
            specialty: null,
            needs: { keys: [], minWidth: null },
            radiusKm: null,
            notes: [],
          });
        assert.match(toolOutput(JSON.parse(options.body)).error, /IGN/);
        return complete({ reply: 'Le lieu doit être vérifié.', question: null });
      },
    );
    assert.equal(result.state.proposal, null);
  });
test('validated displayed result order follows the user into the next agent turn', async () => {
  const { fixtures } = await import('./helpers/database.mjs');
  const { controlledSearch } = await import('./helpers/search-agent.mjs');
  const database = await createTestDatabase(
    fixtures.slice(0, 3).map((record, index) => ({
      ...record,
      id: 'display-' + index,
      specialty: fixtures[0].specialty,
      location: null,
    })),
  );
  const config = { ...env, DB: database };
  try {
    let result = await runSearchAgent(
      { message: 'Sans contrainte géographique', consent: true },
      config,
      async (_url, options) => controlledSearch(JSON.parse(options.body)),
    );
    result = await runSearchAgent(
      { action: 'confirm', consent: true, state: result.state },
      config,
      async (_url, options) => controlledSearch(JSON.parse(options.body)),
    );
    const original = result.results.results.map((record) => record.id),
      displayed = [original[1], original[0], original[2]];
    await runSearchAgent(
      {
        message: 'Explique le premier cabinet affiché',
        displayedPracticeIds: displayed,
        consent: true,
        state: result.state,
      },
      config,
      async (_url, options) => {
        const context = JSON.parse(
          JSON.parse(options.body).input.find((item) => item.role === 'developer').content,
        ).verifiedContext;
        assert.deepEqual(
          context.results.practices.map((practice) => practice.id),
          displayed,
        );
        return complete({ reply: 'Je reprends la première fiche affichée.', question: null });
      },
    );
    await assert.rejects(
      runSearchAgent(
        {
          message: 'premier',
          displayedPracticeIds: ['invented', original[0], original[2]],
          consent: true,
          state: result.state,
        },
        config,
        () => {
          throw Error('No provider');
        },
      ),
      /Ordre/,
    );
  } finally {
    database.close();
  }
});
test('a displayed-order hint cannot override accessibility priority or widen automatic review consent', async () => {
  const { fixtures } = await import('./helpers/database.mjs');
  const { controlledSearch } = await import('./helpers/search-agent.mjs');
  const database = await createTestDatabase(
    Array.from({ length: 5 }, (_, index) => ({
      ...fixtures[0],
      id: 'guard-' + index,
      name: 'Cabinet ' + index,
      evidence: {
        ...fixtures[0].evidence,
        hearing: {
          value: index === 0 ? true : null,
          status: index === 0 ? 'declared' : 'unknown',
          date: null,
        },
      },
    })),
  );
  const config = { ...env, DB: database };
  try {
    let result = await runSearchAgent(
      { message: 'Sans contrainte géographique', consent: true },
      config,
      async (_url, options) =>
        controlledSearch(JSON.parse(options.body), {
          needs: { keys: ['hearing'], minWidth: null },
        }),
    );
    result = await runSearchAgent(
      { action: 'confirm', consent: true, state: result.state },
      config,
      async (_url, options) => controlledSearch(JSON.parse(options.body)),
    );
    const ids = result.results.results.map((practice) => practice.id);
    await assert.rejects(
      runSearchAgent(
        {
          message: 'premier',
          displayedPracticeIds: [ids[1], ids[0], ...ids.slice(2)],
          state: result.state,
          consent: true,
        },
        config,
        () => {
          throw Error('No provider');
        },
      ),
      /Ordre/,
    );
    const displayed = [ids[0], ids[4], ids[2], ids[3], ids[1]];
    let round = 0;
    const next = await runSearchAgent(
      {
        message: 'Lis les avis',
        displayedPracticeIds: displayed,
        state: result.state,
        consent: true,
        reviewConsent: true,
      },
      config,
      async (_url, options) => {
        if (round++ === 0) return call('research_public_identity', { practiceId: ids[4] });
        assert.match(toolOutput(JSON.parse(options.body)).error, /bouton dédié/);
        return complete({ reply: 'Utilisez le bouton de cette fiche.', question: null });
      },
    );
    assert.deepEqual(next.state.autoReviewIds, ids.slice(0, 3));
  } finally {
    database.close();
  }
});

test('principal model honors the user default and generic configuration before any generation', async () => {
  for (const [settings, expected] of [
    [{}, 'gpt-5.4-mini'],
    [{ OPENAI_MODEL: 'user-preferred-model' }, 'user-preferred-model'],
    [{ OPENAI_MODEL: 'user-preferred-model', OPENAI_SEARCH_MODEL: '' }, 'user-preferred-model'],
    [
      { OPENAI_MODEL: 'user-preferred-model', OPENAI_SEARCH_MODEL: 'explicit-search-model' },
      'explicit-search-model',
    ],
  ]) {
    assert.equal(searchConfig(settings).model, expected);
    await runSearchAgent(
      { message: 'Bonjour', consent: true },
      { ...env, ...settings },
      async (_url, options) => {
        assert.equal(JSON.parse(options.body).model, expected);
        return complete({ reply: 'Bonjour.', question: null });
      },
    );
  }
});
