import { getTranslator } from './i18n-core.mjs';

export function speakerLabel(speaker, language = 'fr') {
  const t = getTranslator(language);
  const key = ['patient', 'doctor', 'captured'].includes(speaker) ? speaker : 'unknown';
  return t('consultation.metadata.' + key);
}
export function buildDraft(messages, language = 'fr') {
  if (!messages.length) return '';
  const t = getTranslator(language);
  const demo = messages.some((m) => m.demo);
  return (
    (demo ? t('consultation.draft.fictional') + '\n\n' : '') +
    t('consultation.draft.title') +
    '\n' +
    t('consultation.draft.notice') +
    '\n\n' +
    messages
      .map(
        (m) =>
          `${speakerLabel(m.speaker, language)}${m.corrected ? t('consultation.metadata.corrected') : ''}\n${m.text}`,
      )
      .join('\n\n')
  );
}
export function validateMessage(text, language = 'fr') {
  const t = getTranslator(language);
  if (typeof text !== 'string' || !text.trim()) throw new Error(t('consultation.validation.empty'));
  if (text.length > 4000) throw new Error(t('consultation.validation.tooLong'));
  return text.trim();
}
export function speechError(code, language = 'fr') {
  const t = getTranslator(language);
  const keys = {
    'not-allowed': 'notAllowed',
    'service-not-allowed': 'serviceNotAllowed',
    'audio-capture': 'audioCapture',
    network: 'network',
    'no-speech': 'noSpeech',
    'language-not-supported': 'languageNotSupported',
    aborted: 'aborted',
  };
  const key = Object.hasOwn(keys, code) ? keys[code] : 'unknown';
  return t('consultation.speechErrors.' + key);
}
export function safeCallUrl(value, platform) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const h = u.hostname.toLowerCase();
    const allowed =
      platform === 'doctolib'
        ? h === 'doctolib.fr' || h.endsWith('.doctolib.fr')
        : platform === 'zoom'
          ? h === 'zoom.us' || h.endsWith('.zoom.us') || h === 'zoom.com' || h.endsWith('.zoom.com')
          : false;
    return allowed ? u.href : null;
  } catch {
    return null;
  }
}
export function supportsCallAudio(userAgent, hasDisplayMedia) {
  const version = userAgent.match(/(?:Chrome|Chromium|Edg)\/(\d+)/);
  return (
    !!hasDisplayMedia &&
    !!version &&
    Number(version[1]) >= 135 &&
    !/Android|iPhone|iPad|Mobile/.test(userAgent)
  );
}
