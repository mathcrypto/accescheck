import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const sharedStyles = await readFile('src/ui.css', 'utf8');
const sharedHeader = await readFile('src/header.html', 'utf8');
const routes = {
  'src/index.html': '/',
  'src/consultation.html': '/consultation',
};

async function page(templatePath, entryPoint, stylePath) {
  let template = await readFile(templatePath, 'utf8');
  const header = sharedHeader
    .replace(
      `<a href="${routes[templatePath]}">`,
      `<a href="${routes[templatePath]}" aria-current="page">`,
    )
    .replace(
      '<!--HOME_CONTROLS-->',
      templatePath === 'src/index.html'
        ? '<button id="pauseMotion" type="button" aria-pressed="false">Mettre les animations en pause</button>'
        : '',
    );
  template = template
    .replace('<!--SITE_HEADER-->', header)
    .replace('<!--AGENT_MARK-->', sharedHeader.match(/<svg[\s\S]*?<\/svg>/)[0]);
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
const pages = {
  home: (await page('src/index.html', 'src/home.js', 'src/home.css')).replace(
    '/*HOSPITAL_IMAGE*/',
    (await readFile('src/assets/hospital.jpg')).toString('base64'),
  ),
  consultationPage: await page('src/consultation.html', 'src/companion.js', 'src/consultation.css'),
};
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
