import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve } from 'node:path';

async function page(templatePath, entryPoint, stylePath) {
  let template = await readFile(templatePath, 'utf8');
  if (stylePath) {
    const styles = await readFile(stylePath, 'utf8');
    template = template.replace('/*PAGE_STYLE*/', () => styles);
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
  home: await readFile('src/index.html', 'utf8'),
  searchPage: await page('src/search.html', 'src/search.js'),
  consultationPage: await page('src/consultation.html', 'src/companion.js'),
  assistantPage: await page('src/assistant.html', 'src/assistant.js', 'src/assistant.css'),
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
  platform: 'browser',
  target: 'es2022',
  minify: false,
});
