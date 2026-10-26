import {
  accessProfile,
  profileKey,
  readProfile,
  saveProfile,
  profileDescription,
} from './profile-core.mjs';
import { criteria } from './core.mjs';
import { translate } from './i18n.js';
const $ = (id) => document.getElementById(id);
let candidate = null;
let stored = null;
let draftRevision = 0;
let fictionalContext = false;
export function profileRevision() {
  return draftRevision;
}
export function resetProfileContext() {
  fictionalContext = false;
  draftRevision++;
  offerProfile(null);
}
function refresh() {
  try {
    stored = readProfile(localStorage);
  } catch {
    stored = null;
  }
  $('profileSaved').hidden = !stored;
  if (stored)
    $('profileSavedSummary').textContent =
      (stored.fictional ? 'EXEMPLE FICTIF · ' : '') +
      stored.keys.map((key) => criteria[key].label).join(' · ') +
      (stored.minWidth !== null ? ` · Passage ≥ ${stored.minWidth} cm` : '');
}
export function offerProfile(value, revision = draftRevision) {
  candidate = null;
  $('profileOffer').hidden = true;
  $('profileInlineConsent').checked = false;
  $('saveInlineProfile').disabled = true;
  $('profileInlineStatus').textContent = '';
  if (!value || revision !== draftRevision) return;
  try {
    candidate = accessProfile({
      keys: value.keys,
      minWidth: value.minWidth,
      fictional: fictionalContext,
    });
    $('profileOfferSummary').textContent =
      (candidate.fictional ? 'EXEMPLE FICTIF · ' : '') +
      candidate.keys.map((key) => criteria[key].label).join(' · ') +
      (candidate.minWidth !== null ? ` · Passage ≥ ${candidate.minWidth} cm` : '');
    $('profileOffer').hidden = false;
  } catch {
    /* An incomplete proposal is not a reusable profile. */
  }
}
$('profileInlineConsent').addEventListener('change', () => {
  $('saveInlineProfile').disabled = !$('profileInlineConsent').checked || !candidate;
});
$('saveInlineProfile').addEventListener('click', () => {
  try {
    if (!candidate) return;
    saveProfile(localStorage, candidate, $('profileInlineConsent').checked);
    $('profileInlineStatus').textContent =
      'Critères enregistrés pour 30 jours. La conversation et le lieu ne sont pas conservés.';
    $('profileInlineConsent').checked = false;
    $('saveInlineProfile').disabled = true;
    refresh();
  } catch {
    $('profileInlineStatus').textContent =
      'Ce navigateur refuse l’enregistrement du profil. Votre recherche reste utilisable.';
  }
});
$('reuseProfile').addEventListener('click', () => {
  refresh();
  if (!stored) return;
  if ($('description').value.trim()) {
    $('chatStatus').textContent =
      'Votre message en cours est conservé. Affichez-le ou effacez-le avant de reprendre le profil.';
    return;
  }
  draftRevision++;
  fictionalContext ||= stored.fictional;
  offerProfile(null);
  $('description').value = translate(profileDescription(stored)).replaceAll('\n', ' ');
  $('description').focus();
  $('chatStatus').textContent =
    'Profil préparé, sans envoi. Vérifiez votre accord OpenAI avant d’envoyer la demande.';
});
window.addEventListener('storage', (event) => {
  if (event.key === profileKey || event.key === null) refresh();
});
$('description').addEventListener('input', () => {
  draftRevision++;
  offerProfile(null);
});
refresh();
