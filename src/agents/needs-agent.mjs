import { criteria } from '../core.mjs';
import { needsAgentInstructions } from './needs-prompt.mjs';

export const defaultModel = 'gpt-5.4-mini';
export const needsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keys: {
      type: 'array',
      items: { type: 'string', enum: Object.keys(criteria) },
      maxItems: Object.keys(criteria).length,
    },
    minWidth: { type: ['number', 'null'], minimum: 40, maximum: 200 },
    questions: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 3 },
  },
  required: ['keys', 'minWidth', 'questions'],
};

export function aiConfiguration(env = {}) {
  return {
    available: !!env.OPENAI_API_KEY,
    provider: 'OpenAI',
    model: env.OPENAI_MODEL || defaultModel,
  };
}

export function validateDescription(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !['description', 'consent'].includes(key))
  )
    throw new Error('Seule la description des besoins peut être envoyée à l’IA.');
  if (body.consent !== true)
    throw new Error('Votre accord est requis avant l’envoi de la description à OpenAI.');
  if (
    typeof body.description !== 'string' ||
    !body.description.trim() ||
    body.description.length > 2000
  )
    throw new Error('Décrivez vos besoins en 2 000 caractères maximum.');
  // Reject common identity/contact/address patterns before any provider request.
  if (
    /@|https?:\/\/|\b(?:je m.appelle|mon nom|mon prenom|my name|nom\s*:|prenom\s*:)|\b\d{1,4}\s+(?:rue|avenue|boulevard|place|impasse|all[eé]e|street|road)\b|\b(?:rue|avenue|boulevard|adresse|address|j.habite)\b|\b\d{5}\b|(?:\+33|\b0[1-9])(?:[ .-]?\d{2}){4}\b/i.test(
      body.description,
    )
  )
    throw new Error(
      'Retirez les noms et coordonnées de cette description. Indiquez le lieu dans le champ séparé ; rien n’a été envoyé à OpenAI.',
    );
  return body.description.trim();
}

export function validateExtraction(value) {
  if (
    !value ||
    !Array.isArray(value.keys) ||
    value.keys.length > Object.keys(criteria).length ||
    value.keys.some((key) => !Object.hasOwn(criteria, key)) ||
    new Set(value.keys).size !== value.keys.length ||
    (value.minWidth !== null &&
      (!Number.isFinite(value.minWidth) ||
        value.minWidth < 40 ||
        value.minWidth > 200 ||
        !value.keys.includes('width'))) ||
    !Array.isArray(value.questions) ||
    value.questions.length > 3 ||
    value.questions.some((question) => typeof question !== 'string' || question.length > 300)
  )
    throw new Error('La proposition IA n’est pas valide. Choisissez vos critères manuellement.');
  return { keys: value.keys, minWidth: value.minWidth, questions: value.questions };
}

export async function interpretNeeds(body, env = {}, transport = fetch) {
  const description = validateDescription(body);
  if (!env.OPENAI_API_KEY)
    throw Object.assign(
      new Error(
        'L’assistance IA est indisponible. Vous pouvez utiliser les règles locales ou choisir vos critères.',
      ),
      { status: 503 },
    );
  try {
    const response = await transport('https://api.openai.com/v1/responses', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || defaultModel,
        store: false,
        instructions: needsAgentInstructions,
        input: [{ role: 'user', content: [{ type: 'input_text', text: description }] }],
        ...((env.OPENAI_MODEL || defaultModel).startsWith('gpt-4')
          ? {}
          : { reasoning: { effort: 'low' } }),
        max_output_tokens: 1200,
        text: {
          format: {
            type: 'json_schema',
            name: 'accessibility_needs',
            strict: true,
            schema: needsSchema,
          },
        },
      }),
    });
    if (!response.ok) {
      const error = new Error(
        response.status === 429
          ? 'Le quota ou la limite de requêtes OpenAI est atteint. Utilisez les règles locales ou vos critères manuels.'
          : response.status === 401 || response.status === 403
            ? 'L’accès OpenAI doit être vérifié par l’administrateur.'
            : 'OpenAI est momentanément indisponible. Vous pouvez utiliser les règles locales.',
      );
      error.status = response.status === 429 ? 429 : 503;
      // Safe metadata only; never forward the provider response or credentials.
      error.providerStatus = response.status;
      throw error;
    }
    const data = await response.json();
    if (data.status !== 'completed') throw new Error('Analyse incomplète.');
    const text = data.output
      ?.flatMap((item) => item.content || [])
      .filter((part) => part.type === 'output_text')
      .map((part) => part.text)
      .join('');
    const needs = validateExtraction(JSON.parse(text));
    return {
      ...needs,
      parser: 'OpenAI · proposition à confirmer',
      model: env.OPENAI_MODEL || defaultModel,
      requiresConfirmation: true,
    };
  } catch (cause) {
    if (cause.providerStatus) throw cause;
    throw Object.assign(
      new Error(
        'La proposition IA n’a pas pu être lue. Réessayez ou choisissez vos critères manuellement.',
        { cause },
      ),
      { status: 502 },
    );
  }
}
