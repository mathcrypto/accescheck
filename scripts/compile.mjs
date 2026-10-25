import { readFile, writeFile, mkdir } from 'node:fs/promises';
const scriptPlaceholder = '/*PAGE_SCRIPT*/';

async function inlinePageScript(templatePath, script) {
  const template = await readFile(templatePath, 'utf8');
  if (!template.includes(scriptPlaceholder)) {
    throw new Error(`${templatePath} is missing its script placeholder.`);
  }
  return template.replace(scriptPlaceholder, script);
}

const core = (await readFile('src/core.mjs', 'utf8')).replace(/^export /gm, '');
const data = await readFile('data/practices.json', 'utf8');
const html = await readFile('src/index.html', 'utf8');
const searchScript = await readFile('src/search.js', 'utf8');
const search = await inlinePageScript('src/search.html', searchScript);
const companionCore = (await readFile('src/companion-core.mjs', 'utf8')).replace(/^export /gm, '');
const companionJs = await readFile('src/companion.js', 'utf8');
const companion = await inlinePageScript(
  'src/consultation.html',
  companionCore + '\n' + companionJs,
);
const speech = (await readFile('src/speech.mjs', 'utf8')).replace(/^export /gm, '');
const handler = await readFile('src/handler.mjs', 'utf8');
await mkdir('worker', { recursive: true });
await writeFile(
  'worker/index.js',
  core +
    '\nconst practices=' +
    data +
    ';\nconst html=' +
    JSON.stringify(html) +
    ';\nconst searchHtml=' +
    JSON.stringify(search) +
    ';\nconst consultationHtml=' +
    JSON.stringify(companion) +
    ';\n' +
    speech +
    '\n' +
    handler,
);
