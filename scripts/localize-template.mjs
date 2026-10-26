import { getTranslator, hasTranslation } from '../src/i18n-core.mjs';
const escape = (text) =>
  text.replace(
    /[&<>"]/g,
    (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[value],
  );
// Explicit source keys are resolved before scripts/styles/assets are injected.
export function localizeTemplate(template, language) {
  const t = getTranslator(language);
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9_.]+)\}\}/g, (_, key) => {
    if (!hasTranslation(key, language)) throw new Error(`Missing ${language} translation: ${key}`);
    return escape(t(key));
  });
}
