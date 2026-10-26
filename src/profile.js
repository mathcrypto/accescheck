import { profileKey, readProfile } from './profile-core.mjs';
import { applyLanguage, locale, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
function refresh() {
  try {
    const profile = readProfile(localStorage);
    $('savedProfile').hidden = !profile;
    $('profileEmpty').hidden = Boolean(profile);
    $('savedProfileFacts').replaceChildren();
    if (!profile) return;
    $('profileMode').textContent = t(
      profile.fictional ? 'profile.saved.fictional' : 'profile.saved.real',
    );
    for (const key of profile.keys) {
      const item = document.createElement('li');
      item.textContent = t(`criteria.${key}`);
      $('savedProfileFacts').append(item);
    }
    $('savedProfileWidth').textContent =
      profile.minWidth === null
        ? t('profile.saved.widthUnknown')
        : t('profile.saved.width', { width: profile.minWidth });
    $('profileExpiry').textContent = t('profile.saved.expires', {
      date: new Date(profile.expiresAt).toLocaleDateString(locale),
    });
  } catch {
    $('savedProfile').hidden = true;
    $('profileEmpty').hidden = false;
    $('profileStatus').textContent = t('profile.status.unavailable');
  }
}
$('deleteProfile').addEventListener('click', () => {
  try {
    localStorage.removeItem(profileKey);
    refresh();
    $('profileStatus').textContent = t('profile.status.deleted');
    $('describeNeeds').focus();
  } catch {
    $('profileStatus').textContent = t('profile.status.deleteFailed');
  }
});
window.addEventListener('storage', (event) => {
  if (event.key === profileKey || event.key === null) refresh();
});
refresh();
applyLanguage();
