// Controlled provider replies exercise the real tool executor without billable calls.
export const modelAnswer = (reply, question = null) =>
  Response.json({
    status: 'completed',
    usage: { output_tokens: 120 },
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify({ reply, question }) }],
      },
    ],
  });
export const modelCall = (name, args) =>
  Response.json({
    status: 'completed',
    usage: { output_tokens: 120 },
    output: [
      {
        type: 'reasoning',
        id: 'reasoning-test',
        encrypted_content: 'opaque-test-context',
        summary: [],
      },
      {
        type: 'function_call',
        call_id: crypto.randomUUID(),
        name,
        arguments: JSON.stringify(args),
      },
    ],
  });
export function controlledSearch(
  body,
  { needs = { keys: [], minWidth: null }, specialty = null } = {},
) {
  const context = JSON.parse(
    body.input.findLast((item) => item.role === 'developer').content,
  ).verifiedContext;
  const latest = body.input.findLast((item) => item.role === 'user').content;
  const output = body.input.at(-1);
  if (output.type === 'function_call_output') {
    const call = body.input.find(
      (item) => item.type === 'function_call' && item.call_id === output.call_id,
    );
    const data = JSON.parse(output.output);
    if (data.error)
      return modelAnswer('Précisez votre recherche : ' + data.error, {
        id: 'precision',
        text: 'Pouvez-vous préciser ?',
        options: [],
      });
    if (call.name === 'geocode_place')
      return modelAnswer('Le lieu a été vérifié par IGN.', {
        id: 'distance-utile',
        text: 'Quel rayon vous conviendrait autour de ce lieu ?',
        options: [
          { label: '3 km', value: '3km' },
          { label: '5 km', value: '5km' },
        ],
      });
    if (call.name === 'prepare_search')
      return modelAnswer('Voici les critères retenus. Vous pouvez les corriger ou confirmer.');
    return modelAnswer(
      'Voici les cabinets issus des sources publiques. Les informations absentes restent à confirmer.',
    );
  }
  if (context.confirmed) return modelCall('search_practices', { proposalId: context.proposal.id });
  if (/Lyon 3e|Marseille 8e|Paris 14e/.test(latest)) {
    const city = latest.includes('Marseille')
      ? 'Marseille'
      : latest.includes('Paris')
        ? 'Paris'
        : 'Lyon';
    const district = city === 'Marseille' ? 8 : city === 'Paris' ? 14 : 3;
    return modelCall('geocode_place', {
      query: `${city} ${district}e`,
      city,
      district,
      cityCode: null,
      postcode: null,
      kind: 'municipality',
    });
  }
  if (latest === 'Bonjour')
    return modelAnswer('Quel type de professionnel recherchez-vous ?', {
      id: 'profession-libre',
      text: 'Quel professionnel ?',
      options: [
        { label: 'Dentiste', value: 'dentiste' },
        { label: 'Généraliste', value: 'generaliste' },
      ],
    });
  const location = Object.entries(context.locations).at(-1);
  return modelCall('prepare_search', {
    locationRef: location?.[0] || null,
    specialty: specialty || (location ? 'Dentiste, chirurgien dentiste' : null),
    needs,
    radiusKm: location && latest !== 'Je ne sais pas' ? 3 : null,
    notes: needs.keys.includes('consultation') ? ['Transfert à confirmer auprès du cabinet.'] : [],
  });
}
export function controlledGeography(url) {
  const query = new URL(url).searchParams.get('q');
  const city = query.includes('Marseille')
    ? 'Marseille'
    : query.includes('Paris')
      ? 'Paris'
      : 'Lyon';
  const [district, code, postcode, longitude, latitude] =
    city === 'Marseille'
      ? [8, '13208', '13008', 5.374045, 43.247182]
      : city === 'Paris'
        ? [14, '75114', '75014', 2.323026, 48.830108]
        : [3, '69383', '69003', 4.869577, 45.751578];
  return Response.json({
    features: [
      {
        geometry: { coordinates: [longitude, latitude] },
        properties: {
          label: `${city} ${district}e Arrondissement`,
          name: `${city} ${district}e Arrondissement`,
          city: `${city} ${district}e Arrondissement`,
          citycode: code,
          postcode,
          type: 'municipality',
          id: code,
          context: 'Commune de test',
        },
      },
    ],
  });
}
