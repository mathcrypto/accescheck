import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseNeeds, assess, criteria } from '../src/core.mjs';
import { createHash } from 'node:crypto';
import { needsAgentInstructions } from '../src/agents/needs-prompt.mjs';
import { interpretNeeds } from '../src/agents/needs-agent.mjs';
import { openSqlite } from '../storage/sqlite.mjs';
import { createPracticeStore } from '../src/practice-store.mjs';

const cases = JSON.parse(await readFile(new URL('../evals/needs.json', import.meta.url), 'utf8'));
const live = process.argv.includes('--live');
const same = (actual, expected) =>
  JSON.stringify([...actual.keys].sort()) === JSON.stringify([...expected.keys].sort()) &&
  actual.minWidth === expected.minWidth;
const results = [];
let modelError = null;
for (const entry of cases) {
  const baseline = parseNeeds(entry.text);
  const result = {
    ...entry,
    baseline: {
      keys: baseline.keys,
      minWidth: baseline.minWidth,
      exactMatch: same(baseline, entry),
    },
    ai: null,
  };
  if (live && !modelError) {
    try {
      const actual = await interpretNeeds({ description: entry.text, consent: true }, process.env);
      result.ai = {
        keys: actual.keys,
        minWidth: actual.minWidth,
        model: actual.model,
        exactMatch: same(actual, entry),
      };
    } catch (error) {
      modelError = { error: error.message, providerStatus: error.providerStatus ?? null };
    }
  }
  results.push(result);
}
const database = openSqlite();
let honesty;
try {
  const { records, dataset } = await createPracticeStore(database).candidates({});
  const needs = { keys: Object.keys(criteria), minWidth: 90 };
  let violations = 0;
  let checked = 0;
  for (const record of records) {
    for (const check of assess(record, needs).checks) {
      checked++;
      if (
        (check.value === null || ['unknown', 'stale', 'contradictory'].includes(check.state)) &&
        check.fit === 'met'
      )
        violations++;
    }
  }
  honesty = {
    records: records.length,
    criteriaChecked: checked,
    violations,
    datasetExportedAt: dataset.exportedAt,
  };
} finally {
  database.close();
}
const metric = (values) => ({
  exact: values.filter((value) => value.exactMatch).length,
  total: values.length,
  exactMatchRate: values.length
    ? values.filter((value) => value.exactMatch).length / values.length
    : null,
});
const report = {
  generatedAt: new Date().toISOString(),
  kind: 'labelled synthetic needs; not a clinical validation',
  split: 'Development set; the prompt was iterated on these examples, not a held-out benchmark.',
  promptSha256: createHash('sha256').update(needsAgentInstructions).digest('hex'),
  baseline: metric(results.map((result) => result.baseline)),
  ai: {
    status: modelError ? 'failed' : live ? 'completed' : 'not_run',
    ...metric(results.map((result) => result.ai).filter(Boolean)),
    error: modelError,
  },
  honesty,
  results,
};
const directory = new URL('../evals/results/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('latest.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ baseline: report.baseline, ai: report.ai, honesty }));
if (modelError || honesty.violations) process.exitCode = 1;
