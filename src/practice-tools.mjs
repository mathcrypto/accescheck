import {
  search,
  validateInput,
  briefing,
  parseNeeds,
  evidenceState,
  safeDoctolib,
} from './core.mjs';
import { createPracticeStore } from './practice-store.mjs';

const searchProperties = {
  needs: { type: 'string', maxLength: 2000 },
  width: { type: 'number', minimum: 40, maximum: 200 },
  district: { type: 'string' },
  specialty: { type: 'string' },
  mode: { type: 'string', enum: ['real'] },
  page: { type: 'integer', minimum: 1, maximum: 100000 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100 },
};
const inputSchema = (properties, required) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export const practiceTools = [
  {
    name: 'search_practices',
    description:
      'Rechercher les cabinets importés depuis Accès Libre, avec provenance et pagination. Aucun créneau ni réservation.',
    inputSchema: inputSchema(searchProperties, ['needs']),
  },
  {
    name: 'get_practice_accessibility',
    description:
      'Lire les critères et les champs publics de la fiche Accès Libre d’un cabinet, avec la provenance de l’import.',
    inputSchema: inputSchema({ id: { type: 'string', maxLength: 150 } }, ['id']),
  },
  {
    name: 'create_visit_briefing',
    description:
      'Préparer les questions à poser au cabinet à partir des informations documentées, sans conseil médical.',
    inputSchema: inputSchema({ ...searchProperties, id: { type: 'string', maxLength: 150 } }, [
      'id',
      'needs',
    ]),
  },
];

export async function runPracticeTool(name, args, database) {
  const tool = practiceTools.find((tool) => tool.name === name);
  if (!tool || !args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Outil ou arguments invalides.');
  if (Object.keys(args).some((key) => !Object.hasOwn(tool.inputSchema.properties, key)))
    throw new Error('Paramètre inconnu.');
  for (const required of tool.inputSchema.required)
    if (args[required] === undefined) throw new Error('Paramètre requis : ' + required);
  const store = createPracticeStore(database);
  if (name === 'search_practices') {
    validateInput(args);
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 20;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new Error('Pagination invalide.');
    const { records, dataset } = await store.candidates(args);
    const ranked = search(records, args);
    return {
      ...ranked,
      results: ranked.results.slice((page - 1) * pageSize, page * pageSize),
      total: ranked.results.length,
      page,
      pageSize,
      dataset,
      datasetDate: dataset.exportedAt.slice(0, 10),
    };
  }
  if (typeof args.id !== 'string' || !args.id || args.id.length > 150)
    throw new Error('Identifiant invalide.');
  const practice = await store.get(args.id);
  if (!practice) throw new Error('Établissement introuvable.');
  if (name === 'get_practice_accessibility')
    return {
      ...practice,
      evidence: Object.fromEntries(
        Object.entries(practice.evidence).map(([key, value]) => [
          key,
          { ...value, state: evidenceState(value) },
        ]),
      ),
    };
  validateInput(args);
  return { ...briefing(practice, parseNeeds(args.needs, args.width)), dataset: practice.dataset };
}

export async function practiceSummary(database, id) {
  if (typeof id !== 'string' || !id || id.length > 150) return null;
  const practice = await createPracticeStore(database).get(id);
  return practice
    ? {
        name: practice.name,
        address: practice.address,
        doctolibUrl: safeDoctolib(practice.doctolibUrl),
        evidence: practice.evidence,
        sourceFields: practice.sourceFields,
        sourceUrl: practice.sourceUrl,
        dataset: practice.dataset,
      }
    : null;
}
