import { languagePreference, isLanguage } from './language.mjs';
// Migrate the old browser-only preference before any page content or image is parsed.
if (!languagePreference(new URL(location.href), document.cookie)) {
  let saved;
  try {
    saved = localStorage.getItem('lang');
  } catch {}
  if (isLanguage(saved) && saved !== document.documentElement.lang) {
    const url = new URL(location.href);
    url.searchParams.set('lang', saved);
    location.replace(url.pathname + url.search + url.hash);
  }
}
