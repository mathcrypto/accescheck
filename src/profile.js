import { criteria } from './core.mjs';
import { profileKey, readProfile } from './profile-core.mjs';

const $ = (id) => document.getElementById(id);
function refresh() {
  try {
    const profile = readProfile(localStorage);
    $('savedProfile').hidden = !profile;
    $('profileEmpty').hidden = Boolean(profile);
    $('savedProfileFacts').replaceChildren();
    if (!profile) return;
    $('profileMode').textContent = profile.fictional
      ? 'EXEMPLE FICTIF conservé · ne représente pas vos besoins réels.'
      : 'Critères extraits par l’agent de votre demande, puis confirmés par vous.';
    for (const key of profile.keys) {
      const item = document.createElement('li');
      item.textContent = criteria[key].label;
      $('savedProfileFacts').append(item);
    }
    $('savedProfileWidth').textContent =
      profile.minWidth === null
        ? 'Largeur minimale non renseignée : aucune mesure supposée.'
        : `Largeur minimale confirmée : ${profile.minWidth} cm.`;
    $('profileExpiry').textContent =
      `Réutilisable sur ce navigateur jusqu’au ${new Date(profile.expiresAt).toLocaleDateString('fr-FR')}.`;
  } catch {
    $('savedProfile').hidden = true;
    $('profileEmpty').hidden = false;
    $('profileStatus').textContent =
      'La mémoire de ce navigateur est indisponible. Vous pouvez continuer à décrire vos besoins sans les conserver.';
  }
}
$('deleteProfile').addEventListener('click', () => {
  try {
    localStorage.removeItem(profileKey);
    refresh();
    $('profileStatus').textContent = 'Profil supprimé de cet appareil.';
    $('describeNeeds').focus();
  } catch {
    $('profileStatus').textContent =
      'La suppression a échoué. Vérifiez les réglages de stockage du navigateur.';
  }
});
window.addEventListener('storage', (event) => {
  if (event.key === profileKey || event.key === null) refresh();
});
refresh();
