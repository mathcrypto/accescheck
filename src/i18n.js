import { getTranslator } from './i18n-core.mjs';
import { languagePreference, languageCookie } from './language.mjs';
function storedLang() {
  const requested =
    globalThis.location &&
    languagePreference(new URL(location.href), globalThis.document?.cookie || '');
  if (requested) {
    try {
      localStorage.setItem('lang', requested);
    } catch {}
    return requested;
  }
  try {
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
}
export const lang = storedLang() === 'en' ? 'en' : 'fr';
export const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
export const t = getTranslator(lang);
export function localizedUrl(value) {
  const url = new URL(value, location.href);
  url.searchParams.set('lang', lang);
  return url.pathname + url.search + url.hash;
}
export function applyLanguage() {
  document.documentElement.lang = lang;
  try {
    document.cookie = `${languageCookie}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {}
  const current = localizedUrl(location.href);
  if (current !== location.pathname + location.search + location.hash)
    history.replaceState(history.state, '', current);
  const link = document.getElementById('langSwitch');
  const next = lang === 'en' ? 'fr' : 'en';
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  link.textContent = t('common.languageSwitch.label');
  link.lang = next;
  link.hreflang = next;
  link.href = url.pathname + url.search + url.hash;
}
