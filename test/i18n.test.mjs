import test from 'node:test';
import assert from 'node:assert/strict';
import { resources, getTranslator, hasTranslation } from '../src/i18n-core.mjs';
import { localizeTemplate } from '../scripts/localize-template.mjs';
import { languagePreference } from '../src/language.mjs';

const store = new Map();
globalThis.location = { search: '?lang=en', href: 'http://localhost/?lang=en' };
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
const { lang, t } = await import('../src/i18n.js');
function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => {
    assert.match(key, /^[a-zA-Z][a-zA-Z0-9_]*$/, 'Translation keys are semantic identifiers');
    const path = prefix ? prefix + '.' + key : key;
    if (typeof item === 'object' && item !== null) return flatten(item, path);
    assert.equal(typeof item, 'string', path);
    assert.ok(item.trim(), path);
    return [path];
  });
}
test('FR and EN JSON resources contain the same complete semantic keys', () => {
  const fr = flatten(resources.fr.translation).sort();
  const en = flatten(resources.en.translation).sort();
  assert.ok(fr.length > 400);
  assert.deepEqual(en, fr);
  for (const key of fr) {
    assert.equal(hasTranslation(key, 'fr'), true, key);
    assert.equal(hasTranslation(key, 'en'), true, key);
  }
});
test('explicit language selects English and is remembered', () => {
  assert.equal(lang, 'en');
  assert.equal(store.get('lang'), 'en');
  assert.equal(t('profile.actions.delete'), 'Delete my profile');
});
test('interpolation uses named values and never rewrites their contents', () => {
  assert.equal(t('profile.saved.width', { width: 95 }), 'Confirmed minimum width: 95 cm.');
  const raw = 'Vous Oui <b>Entrée sans marche</b>';
  assert.equal(t('results.newTab', { label: raw }), raw + ' (new tab)');
  assert.equal(getTranslator('fr')('profile.actions.delete'), 'Supprimer mon profil');
});
test('source templates resolve explicit keys and escape HTML at rendering boundary', () => {
  assert.equal(
    localizeTemplate('<h1>{{home.hero.title}}</h1>', 'en'),
    '<h1>Find a practice that fits your needs.</h1>',
  );
  assert.equal(
    localizeTemplate('<p>Votre texte libre ne change pas.</p>', 'en'),
    '<p>Votre texte libre ne change pas.</p>',
  );
  assert.throws(() => localizeTemplate('{{home.missingKey}}', 'en'), /Missing en translation/);
});
test('language precedence is explicit URL, saved preference cookie, then default', () => {
  assert.equal(
    languagePreference(new URL('https://example.com/?lang=en'), 'accescheck_lang=fr'),
    'en',
  );
  assert.equal(
    languagePreference(new URL('https://example.com/'), 'other=1; accescheck_lang=en'),
    'en',
  );
  assert.equal(
    languagePreference(new URL('https://example.com/?lang=bad'), 'accescheck_lang=bad'),
    null,
  );
});
test('explicit language still works when browser storage is refused', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('Refused');
    },
    setItem() {
      throw new Error('Refused');
    },
  };
  try {
    assert.equal((await import('../src/i18n.js?storage-refused')).lang, 'en');
  } finally {
    globalThis.localStorage = previous;
  }
});
