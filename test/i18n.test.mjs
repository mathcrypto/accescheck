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
test('profile management and reusable request labels are translated', () => {
  assert.equal(translate('Votre profil d’accès.'), 'Your access profile.');
  assert.equal(translate('Largeur minimale confirmée : 95 cm.'), 'Confirmed minimum width: 95 cm.');
  assert.equal(translate('Passage ≥ 95 cm'), 'Clear width ≥ 95 cm');
  assert.equal(translate('Profil supprimé de cet appareil.'), 'Profile deleted from this device.');
});
test('an explicit language still works when browser storage is refused', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('Storage refused');
    },
    setItem() {
      throw new Error('Storage refused');
    },
  };
  try {
    const isolated = await import('../src/i18n.js?storage-refused');
    assert.equal(isolated.lang, 'en');
  } finally {
    globalThis.localStorage = previous;
  }
});
test('directory fallback notices, consent and geographic warnings are translated', () => {
  assert.equal(
    translate('Annuaire public : aucun besoin ni lieu n’a été interprété.'),
    'Public directory: no needs or location have been interpreted.',
  );
  assert.equal(
    translate('Mode dégradé sans agent. Les besoins d’accès restent à vérifier sur chaque fiche.'),
    'Fallback mode without an agent. Access needs still need to be checked on each card.',
  );
  assert.equal(
    translate('Évitez les noms et coordonnées personnels.'),
    'Avoid names and personal contact details.',
  );
  assert.equal(translate('Lieu non vérifié par IGN.'), 'Location not verified by IGN.');
});
