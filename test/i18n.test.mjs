import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.location = { search: '?lang=en', href: 'http://localhost/?lang=en' };
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
const { lang, translate } = await import('../src/i18n.js');

test('?lang=en selects English and is remembered', () => {
  assert.equal(lang, 'en');
  assert.equal(store.get('lang'), 'en');
});
test('composed card and result texts are translated phrase by phrase', () => {
  assert.equal(
    translate('Entrée sans marche : Oui · Déclaré'),
    'Step-free entrance : Yes · Declared',
  );
  assert.equal(translate('0,8 km de votre adresse'), '0,8 km from your address');
  assert.equal(
    translate(
      '34 fiche(s) · page 1. Accessibilité, puis proximité, puis réputation si renseignée.',
    ),
    '34 card(s) · page 1. Accessibility first, then distance, then reputation when known.',
  );
});
test('single words only change as whole words, and unknown text is left alone', () => {
  assert.equal(translate('Nonce Ouistreham'), 'Nonce Ouistreham');
  assert.equal(translate('Cabinet Lumière'), 'Cabinet Lumière');
});
test('a sentence wrapped over several lines in the HTML source still matches', () => {
  assert.equal(
    translate('Trouvez un cabinet\n        adapté à vos besoins.'),
    'Find a practice that fits your needs.',
  );
});
