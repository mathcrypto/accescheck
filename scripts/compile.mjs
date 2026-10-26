import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { localizeTemplate } from './localize-template.mjs';

const sharedStyles = await readFile('src/ui.css', 'utf8');
const sharedHeader = await readFile('src/header.html', 'utf8');
const bootstrap = await build({
  entryPoints: ['src/language-bootstrap.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
});
const languageBootstrap = '<script>' + bootstrap.outputFiles[0].text + '</script>';
const brandMark = sharedHeader.match(/<svg[\s\S]*?<\/svg>/)[0];
const favicon = `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(
  brandMark.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '),
).toString('base64')}">`;
const routes = {
  'src/index.html': '/',
  'src/consultation.html': '/consultation',
  'src/profile.html': '/profil',
};

async function page(templatePath, entryPoint, stylePath, language = 'fr') {
  let template = await readFile(templatePath, 'utf8');
  const header = sharedHeader
    .replace(
      `<a href="${routes[templatePath]}?lang={{common.language}}">`,
      `<a href="${routes[templatePath]}?lang={{common.language}}" aria-current="page">`,
    )
    .replace(
      '<!--HOME_CONTROLS-->',
      templatePath === 'src/index.html'
        ? '<button id="pauseMotion" type="button" aria-pressed="false">{{home.motion.pause}}</button>'
        : '',
    );
  template = template
    .replace('<!--SITE_HEADER-->', header)
    .replace('<!--AGENT_MARK-->', brandMark)
    .replace('</head>', favicon + '\n</head>');
  template = localizeTemplate(template, language);
  template = template.replace(
    '<meta charset="utf-8" />',
    '<meta charset="utf-8" />' + languageBootstrap,
  );
  if (stylePath) {
    const styles = await readFile(stylePath, 'utf8');
    template = template.replace('/*PAGE_STYLE*/', () => styles + '\n' + sharedStyles);
  }
  const placeholder = '/*PAGE_SCRIPT*/';
  if (!template.includes(placeholder))
    throw new Error(`${templatePath} is missing its script placeholder.`);
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: false,
  });
  return template.replace(placeholder, () =>
    result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'),
  );
}
const hospital = await readFile('src/assets/hospital.jpg');
const hospitalAsset = {
  path: `/assets/hospital-${createHash('sha256').update(hospital).digest('hex').slice(0, 16)}.jpg`,
  data: hospital.toString('base64'),
};
const pages = { hospitalAsset };
for (const [language, suffix] of [
  ['fr', ''],
  ['en', 'English'],
]) {
  pages['home' + suffix] = (
    await page('src/index.html', 'src/home.js', 'src/home.css', language)
  ).replace('/*HOSPITAL_IMAGE*/', hospitalAsset.path);
  pages['consultationPage' + suffix] = await page(
    'src/consultation.html',
    'src/companion.js',
    'src/consultation.css',
    language,
  );
  pages['profilePage' + suffix] = await page(
    'src/profile.html',
    'src/profile.js',
    'src/profile.css',
    language,
  );
}
await mkdir('worker', { recursive: true });
await build({
  stdin: {
    contents: `import { createHandler } from './src/handler.mjs'; export default createHandler(${JSON.stringify(pages)});`,
    resolveDir: resolve('.'),
    loader: 'js',
  },
  bundle: true,
  outfile: 'worker/index.js',
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  minify: false,
  // Edge TTS uses Node WebSocket APIs; keep it outside the worker bundle.
  external: ['node-edge-tts'],
});
