import { criteria } from './core.mjs';
import { accessProfile, profileKey, readProfile, saveProfile } from './profile-core.mjs';

const $ = (id) => document.getElementById(id);
let fictional = false;
let controller;
let revision = 0;
function buttons() {
  $('extractProfile').disabled = !$('profileAiConsent').checked || Boolean(controller);
  $('stopProfile').hidden = !controller;
  $('saveProfile').disabled = !$('profileSaveConsent').checked || Boolean(controller);
  $('profileSaveConsent').disabled = Boolean(controller);
  $('profileCriteria').disabled = Boolean(controller);
  $('profileWidth').disabled = Boolean(controller);
}
for (const [key, criterion] of Object.entries(criteria)) {
  const label = document.createElement('label'),
    input = document.createElement('input');
  input.type = 'checkbox';
  input.value = key;
  label.append(input, document.createTextNode(criterion.label));
  $('profileCriteria').append(label);
}
function populate(value, mode) {
  const profile = accessProfile({
    keys: value.keys,
    minWidth: value.minWidth,
    fictional: value.fictional,
  });
  fictional = profile.fictional;
  for (const input of $('profileCriteria').querySelectorAll('input'))
    input.checked = profile.keys.includes(input.value);
  $('profileWidth').value = profile.minWidth ?? '';
  $('profileMode').textContent = mode;
  $('profileSaveConsent').checked = false;
  buttons();
}
function current() {
  return accessProfile({
    keys: [...$('profileCriteria').querySelectorAll('input:checked')].map((input) => input.value),
    minWidth: $('profileWidth').value ? Number($('profileWidth').value) : null,
    fictional,
  });
}
function saved() {
  try {
    const profile = readProfile(localStorage);
    $('savedProfile').hidden = !profile;
    if (profile) {
      $('savedProfileSummary').textContent =
        (profile.fictional ? 'EXEMPLE FICTIF · ' : '') +
        profile.keys.map((key) => criteria[key].label).join(' · ') +
        (profile.minWidth !== null ? ` · Passage ≥ ${profile.minWidth} cm` : '');
      $('profileExpiry').textContent =
        `Conservé sur ce navigateur jusqu’au ${new Date(profile.expiresAt).toLocaleDateString('fr-FR')}.`;
    }
    return profile;
  } catch {
    $('profileStatus').textContent =
      'La mémoire de ce navigateur est indisponible. Vous pouvez préparer votre profil sans l’enregistrer.';
    return null;
  }
}
$('profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!$('profileAiConsent').checked || controller) return;
  const description = $('profileRequest').value.trim();
  if (!description) {
    $('profileStatus').textContent = 'Décrivez vos besoins avant de continuer.';
    return;
  }
  const active = new AbortController(),
    version = ++revision;
  controller = active;
  buttons();
  $('profileSaveConsent').checked = false;
  $('saveProfile').disabled = true;
  $('profileStatus').textContent = 'L’agent OpenAI propose des critères à partir de votre demande…';
  try {
    const response = await fetch('/api/profile-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, consent: true }),
      signal: active.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Proposition indisponible. Réessayez.');
    if (version !== revision) return;
    populate(
      { keys: data.keys, minWidth: data.minWidth },
      'Proposition de l’agent · relisez et corrigez avant de conserver.',
    );
    $('profileStatus').textContent =
      'Proposition prête. Rien n’a été enregistré. Vérifiez chaque critère.';
  } catch (error) {
    if (version === revision)
      $('profileStatus').textContent = active.signal.aborted
        ? 'Proposition interrompue. Un envoi déjà commencé ne peut pas être rappelé.'
        : error.message;
  } finally {
    if (controller === active) controller = null;
    buttons();
  }
});
$('profileAiConsent').addEventListener('change', () => {
  if (!$('profileAiConsent').checked) {
    const wasPending = Boolean(controller);
    revision++;
    controller?.abort();
    controller = null;
    if (wasPending)
      $('profileStatus').textContent =
        'Proposition interrompue. Un envoi déjà commencé ne peut pas être rappelé.';
  }
  buttons();
});
$('stopProfile').addEventListener('click', () => controller?.abort());
$('profileSaveConsent').addEventListener('change', buttons);
function edited() {
  $('profileSaveConsent').checked = false;
  $('saveProfileStatus').textContent = '';
  buttons();
}
$('profileCriteria').addEventListener('change', () => {
  if (!$('profileCriteria').querySelector('[value="width"]').checked) $('profileWidth').value = '';
  edited();
});
$('profileWidth').addEventListener('input', () => {
  if ($('profileWidth').value) $('profileCriteria').querySelector('[value="width"]').checked = true;
  edited();
});
$('saveProfile').addEventListener('click', () => {
  if (controller) return;
  try {
    saveProfile(localStorage, current(), $('profileSaveConsent').checked);
    $('profileRequest').value = '';
    $('profileAiConsent').checked = false;
    $('profileSaveConsent').checked = false;
    $('saveProfileStatus').textContent = fictional
      ? 'Profil fictif enregistré comme exemple, pas comme vos besoins réels.'
      : 'Profil enregistré sur cet appareil pour 30 jours. Votre demande n’a pas été conservée.';
    buttons();
    saved();
  } catch (error) {
    $('saveProfileStatus').textContent =
      error.name === 'SecurityError' || error.name === 'QuotaExceededError'
        ? 'Le navigateur refuse l’enregistrement. Aucun profil n’a été conservé.'
        : error.message;
  }
});
$('deleteProfile').addEventListener('click', () => {
  try {
    localStorage.removeItem(profileKey);
    $('savedProfile').hidden = true;
    $('saveProfileStatus').textContent = 'Profil supprimé de cet appareil.';
    $('profileSaveConsent').checked = false;
    buttons();
  } catch {
    $('saveProfileStatus').textContent =
      'La suppression a échoué. Vérifiez les réglages de stockage du navigateur.';
  }
});
$('profileExample').addEventListener('click', () => {
  revision++;
  controller?.abort();
  controller = null;
  $('profileRequest').value =
    'EXEMPLE FICTIF : entrée sans marche, trajet sans marche jusqu’à l’accueil, passage de 90 cm.';
  $('profileAiConsent').checked = false;
  populate(
    { keys: ['stepFree', 'route', 'width'], minWidth: 90, fictional: true },
    'EXEMPLE FICTIF · proposition illustrative, aucun appel IA.',
  );
  $('profileStatus').textContent =
    'Exemple chargé sans envoi ni enregistrement. Vous pouvez tester la sauvegarde avec son marqueur fictif.';
});
window.addEventListener('storage', (event) => {
  if (event.key === profileKey) saved();
});
window.addEventListener('pagehide', () => {
  revision++;
  controller?.abort();
  $('profileRequest').value = '';
});
const previous = saved();
if (previous)
  populate(
    previous,
    previous.fictional
      ? 'EXEMPLE FICTIF enregistré · modifiable.'
      : 'Votre profil enregistré · modifiable après relecture.',
  );
buttons();
