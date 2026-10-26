/** Microsoft Edge neural TTS helpers (via /api/speech). */
import { lang } from './i18n.js';

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
export async function speakEdge(text, { signal, onEnd, onError } = {}) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Aucun texte à lire.');
  stopSpeechPlayback();
  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: value, consent: true, provider: 'edge', lang }),
    signal,
  });
  if (!response.ok) {
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
