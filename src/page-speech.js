/** Microsoft Edge neural TTS helpers (via /api/speech). */

export function collectVisibleText(selectors, { maxChars = 4000, cardLimit = 3 } = {}) {
  const parts = [];
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.hidden || node.closest('[hidden]')) continue;
      const style = window.getComputedStyle?.(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
      let text;
      if (node.id === 'results' || node.classList.contains('results')) {
        const cards = [...node.querySelectorAll('.practice-card')].slice(0, cardLimit);
        text = cards
          .map((card) => card.innerText.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('. ');
        if (cards.length < node.querySelectorAll('.practice-card').length)
          text += '. Autres fiches non lues.';
      } else text = node.innerText.replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    }
  }
  return parts.join('. ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

let remoteAudio = null;
let remoteUrl = null;

export function stopSpeechPlayback() {
  try {
    remoteAudio?.pause();
    window.speechSynthesis?.cancel();
  } catch {}
  remoteAudio = null;
  if (remoteUrl) {
    try {
      URL.revokeObjectURL(remoteUrl);
    } catch {}
    remoteUrl = null;
  }
}

/** Microsoft Edge neural TTS. Clicking Lire is the user action that sends text to Microsoft. */
export async function speakEdge(text, { signal, onEnd, onError, lang = 'fr' } = {}) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Aucun texte à lire.');
  stopSpeechPlayback();
  let response;
  try {
    response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: value, consent: true, provider: 'edge', lang }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
  }
  // Microsoft's service can refuse the hosting servers: fall back to the browser's own voice.
  if (!response?.ok) {
    if (window.speechSynthesis && window.SpeechSynthesisUtterance)
      return speakBrowser(value, { lang, onEnd, onError });
    let message = 'La lecture vocale est indisponible.';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith('audio/'))
    throw new Error('La lecture vocale n’a pas renvoyé un son lisible.');
  remoteUrl = URL.createObjectURL(blob);
  const audio = new Audio(remoteUrl);
  remoteAudio = audio;
  audio.onended = () => {
    stopSpeechPlayback();
    onEnd?.();
  };
  audio.onerror = () => {
    stopSpeechPlayback();
    onError?.();
  };
  await audio.play();
  return audio;
}

function speakBrowser(text, { lang, onEnd, onError }) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'en' ? 'en-GB' : 'fr-FR';
  utterance.voice =
    speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.startsWith(lang === 'en' ? 'en' : 'fr')) || null;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onError?.();
  speechSynthesis.speak(utterance);
  return utterance;
}
