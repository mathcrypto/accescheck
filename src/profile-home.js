import {
  accessProfile,
  profileKey,
  readProfile,
  saveProfile,
  profileDescription,
} from './profile-core.mjs';
import { t } from './i18n.js';
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
      (stored.fictional ? t('profile.fictionalPrefix') : '') +
      stored.keys.map((key) => t(`criteria.${key}`)).join(' · ') +
      (stored.minWidth !== null
        ? ' · ' + t('profile.summaryWidth', { width: stored.minWidth })
        : '');
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
      (candidate.fictional ? t('profile.fictionalPrefix') : '') +
      candidate.keys.map((key) => t(`criteria.${key}`)).join(' · ') +
      (candidate.minWidth !== null
        ? ' · ' + t('profile.summaryWidth', { width: candidate.minWidth })
        : '');
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
    $('profileInlineStatus').textContent = t('profile.status.saved');
    $('profileInlineConsent').checked = false;
    $('saveInlineProfile').disabled = true;
    refresh();
  } catch {
    $('profileInlineStatus').textContent = t('profile.status.saveFailed');
  }
});
$('reuseProfile').addEventListener('click', () => {
  refresh();
  if (!stored) return;
  if ($('description').value.trim()) {
    $('chatStatus').textContent = t('profile.status.draft');
    return;
  }
  draftRevision++;
  fictionalContext ||= stored.fictional;
  offerProfile(null);
  $('description').value = profileDescription(stored, t).replaceAll('\n', ' ');
  $('description').focus();
  $('chatStatus').textContent = t('profile.status.prepared');
});
window.addEventListener('storage', (event) => {
  if (event.key === profileKey || event.key === null) refresh();
});
$('description').addEventListener('input', () => {
  draftRevision++;
  offerProfile(null);
});
refresh();
