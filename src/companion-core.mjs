export const speakerLabel = (speaker) =>
  ({
    patient: 'Patient · message écrit',
    doctor: 'Soignant · saisie manuelle',
    captured: 'Parole captée · locuteur non identifié',
  })[speaker] || 'Message';
export function buildDraft(messages) {
  if (!messages.length) return '';
  const demo = messages.some((m) => m.demo);
  return (
    (demo ? 'EXEMPLE FICTIF — ne pas utiliser comme notes médicales.\n\n' : '') +
    'BROUILLON DE CONVERSATION — À RELIRE AVEC LE SOIGNANT\nTranscription non vérifiée, sans interprétation ni synthèse médicale.\n\n' +
    messages
      .map((m) => `${speakerLabel(m.speaker)}${m.corrected ? ' · corrigé' : ''}\n${m.text}`)
      .join('\n\n')
  );
}
export function validateMessage(text) {
  if (typeof text !== 'string' || !text.trim())
    throw new Error('Écrivez un message avant de continuer.');
  if (text.length > 4000) throw new Error('Limitez ce message à 4 000 caractères.');
  return text.trim();
}
export function speechError(code) {
  return (
    {
      'not-allowed':
        'L’accès au microphone a été refusé. Autorisez-le dans le navigateur, puis réessayez, ou utilisez la saisie manuelle.',
      'service-not-allowed':
        'Le service vocal n’est pas autorisé dans ce navigateur. Vous pouvez échanger par écrit.',
      'audio-capture':
        'Aucun microphone utilisable. Vérifiez votre appareil ou utilisez la saisie manuelle.',
      network:
        'Le service vocal est indisponible. Aucun redémarrage automatique : réessayez ou utilisez la saisie manuelle.',
      'no-speech':
        'Aucune parole détectée. Les sous-titres sont arrêtés ; vous pouvez les relancer.',
      'language-not-supported':
        'Le français n’est pas disponible dans ce mode. Installez le pack local si proposé, ou choisissez explicitement le service du navigateur.',
      aborted: 'Les sous-titres sont arrêtés.',
    }[code] ||
    'La reconnaissance vocale s’est arrêtée. Vous pouvez réessayer ou saisir les paroles manuellement.'
  );
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
