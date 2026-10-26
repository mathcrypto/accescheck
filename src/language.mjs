export const languageCookie = 'accescheck_lang';
export const isLanguage = (value) => value === 'fr' || value === 'en';
export function languagePreference(url, cookie = '') {
  const explicit = url.searchParams.get('lang');
  if (isLanguage(explicit)) return explicit;
  const saved = cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(languageCookie + '='))
    ?.slice(languageCookie.length + 1);
  return isLanguage(saved) ? saved : null;
}
