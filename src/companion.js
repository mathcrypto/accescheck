import {
  speakerLabel,
  validateMessage,
  buildDraft,
  speechError,
  safeCallUrl,
  supportsCallAudio,
} from './companion-core.mjs';
const $ = (id) => document.getElementById(id);
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;
let messages = [],
  nextId = 1,
  recognition = null,
  listening = false,
  starting = false,
  generation = 0,
  voices = [],
  utterance = null,
  editingId = null,
  demoActive = false;
let sharedStream = null,
  sessionPlatform = 'office',
  connectionGeneration = 0,
  callMonitor = null,
  callMonitorSource = null,
  callAnalyser = null,
  callMeterTimer = null,
  heardCallAudio = false,
  captionRetry = null,
  captionWatch = null,
  captionFatal = false,
  silentRestarts = 0;
const status = (text, error = false) => {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
  const feedback = document.querySelector('dialog[open] .dialog-status');
  if (feedback) {
    feedback.textContent = text;
    feedback.hidden = !text;
    feedback.classList.toggle('error', error);
  }
};
function micState(text, active = false) {
  if (sharedStream && text === 'Microphone coupé') text = 'Son d’onglet connecté · en pause';
  $('micText').textContent = text;
  document.title = active ? '● Sous-titres — AccèsCheck' : 'Mon rendez-vous — AccèsCheck';
  $('micState').classList.toggle('recording', active);
  $('pauseCaptions').disabled = !active && !starting;
  $('startCaptions').disabled = !Recognition || active || starting || !!utterance;
}
function invalidateNotes() {
  if ($('notes').value) {
    stopSpeech();
    $('reviewed').checked = false;
    $('readNotes').disabled = true;
    $('notesWarning').textContent =
      'L’échange a changé. Vérifiez ou actualisez vos notes avant de les écouter.';
  }
}
function captionHint(text) {
  const note = document.querySelector('#empty p');
  if (note)
    note.textContent =
      text ||
      'Démarrez les sous-titres après l’accord des personnes présentes, ou écrivez votre réponse.';
}
function stopCallMonitor() {
  if (callMeterTimer) {
    clearInterval(callMeterTimer);
    callMeterTimer = null;
  }
  heardCallAudio = false;
  try {
    callMonitorSource?.disconnect();
  } catch {}
  callMonitorSource = null;
  callAnalyser = null;
  const context = callMonitor;
  callMonitor = null;
  if (context) context.close().catch(() => {});
  const meter = $('audioMeter');
  if (meter) {
    meter.value = 0;
    meter.hidden = true;
  }
}
function hearSharedCall(stream) {
  stopCallMonitor();
  if (typeof AudioContext !== 'function' || !(stream instanceof MediaStream)) return;
  try {
    const context = new AudioContext();
    callMonitor = context;
    const source = context.createMediaStreamSource(stream);
    callMonitorSource = source;
    source.connect(context.destination);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    callAnalyser = analyser;
    const samples = new Float32Array(analyser.fftSize);
    const meter = $('audioMeter');
    if (meter) meter.hidden = false;
    const began = Date.now();
    callMeterTimer = setInterval(() => {
      if (!callAnalyser || !sharedStream) return;
      callAnalyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) energy += value * value;
      const rms = Math.sqrt(energy / samples.length);
      if (meter) meter.value = Math.round(Math.min(100, rms * 400));
      if (rms > 0.012) heardCallAudio = true;
      if (!listening || messages.length || Date.now() - began < 3500) return;
      if (!heardCallAudio) {
        captionHint(
          'Votre propre microphone n’est pas inclus dans le son de l’onglet. Seule la voix des autres participants, jouée par l’appel, peut devenir un sous-titre.',
        );
        status(
          'Aucun son ne sort de l’onglet. Votre propre microphone n’est pas inclus dans le son partagé.',
          true,
        );
      } else if ($('recognitionMode').value === 'local') {
        captionHint(
          'Du son arrive, mais le mode sur cet appareil ne transcrit pas cet onglet. Ouvrez les réglages et choisissez le service vocal du navigateur.',
        );
        status(
          'Du son arrive de l’onglet, sans parole reconnue. Choisissez « Service vocal du navigateur », acceptez, puis relancez les sous-titres.',
          true,
        );
      }
    }, 400);
    context.resume?.();
  } catch {
    stopCallMonitor();
  }
}
function releaseSharedAudio() {
  connectionGeneration++;
  stopCallMonitor();
  const stream = sharedStream;
  sharedStream = null;
  stream?.getTracks().forEach((t) => t.stop());
  if ($('disconnectCallAudio')) $('disconnectCallAudio').disabled = true;
  updateConnection();
}
function stopSpeech() {
  if (synth) synth.cancel();
  utterance = null;
  $('startCaptions').disabled = !Recognition || starting || listening;
}
function clearCaptionRetry() {
  if (captionRetry) {
    clearTimeout(captionRetry);
    captionRetry = null;
  }
}
function clearCaptionWatch() {
  if (captionWatch) {
    clearTimeout(captionWatch);
    captionWatch = null;
  }
}
function offerBrowserSpeech(show) {
  const offer = $('browserSpeechOffer');
  if (offer) offer.hidden = !show;
}
function armCaptionWatch(r, token) {
  clearCaptionWatch();
  captionWatch = setTimeout(() => {
    captionWatch = null;
    if (recognition !== r || token !== generation || !listening) return;
    if (
      ($('interim').textContent || '').trim() ||
      messages.some((m) => m.speaker === 'captured' && !m.demo)
    )
      return;
    try {
      r.stop();
    } catch {}
  }, 8000);
}
function pauseCaptions(announce = true, disconnect = true) {
  clearCaptionRetry();
  clearCaptionWatch();
  offerBrowserSpeech(false);
  generation++;
  starting = false;
  listening = false;
  captionFatal = false;
  const r = recognition;
  recognition = null;
  try {
    r?.abort();
  } catch {}
  if (disconnect) releaseSharedAudio();
  $('interim').textContent = '';
  micState('Microphone coupé');
  if (announce) status('Sous-titres en pause. La capture audio est arrêtée.');
}
function render() {
  const log = $('transcript');
  log.replaceChildren();
  $('empty').hidden = messages.length > 0;
  $('demoLabel').textContent = demoActive ? 'EXEMPLE FICTIF · Aucune voix réelle captée.' : '';
  for (const m of messages) {
    const article = document.createElement('div');
    article.id = 'message-' + m.id;
    article.tabIndex = -1;
    article.className = 'message' + (m.speaker === 'patient' ? ' patient' : '');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const label = document.createElement('span');
    label.textContent =
      speakerLabel(m.speaker) + (m.corrected ? ' · corrigé' : '') + (m.demo ? ' · fictif' : '');
    const edit = document.createElement('button');
    edit.className = 'edit';
    edit.dataset.messageId = m.id;
    edit.textContent = 'Corriger';
    edit.setAttribute('aria-label', 'Corriger : ' + m.text.slice(0, 45));
    edit.onclick = () => {
      editingId = m.id;
      $('editText').value = m.text;
      $('editDialog').querySelector('.dialog-status').hidden = true;
      $('editDialog').showModal();
      $('editText').focus();
    };
    meta.append(label, edit);
    const text = document.createElement('p');
    text.textContent = m.text;
    article.append(meta, text);
    log.append(article);
  }
  $('captionScroll').scrollTop = $('captionScroll').scrollHeight;
}
function append(text, speaker, demo = false) {
  const value = validateMessage(text);
  if (
    messages.length >= 150 ||
    messages.reduce((n, m) => n + m.text.length, 0) + value.length > 20000
  )
    throw new Error(
      'La session a atteint sa limite. Copiez vos notes, puis effacez la session pour continuer.',
    );
  invalidateNotes();
  messages.push({ id: nextId++, text: value, speaker, demo, corrected: false });
  render();
}
function checkDemo() {
  if (demoActive) throw new Error('Effacez l’exemple fictif avant de commencer un échange réel.');
}
function showLatestMessage() {
  tab('conversation');
  const message = $('transcript').lastElementChild;
  if (!message) return;
  message.focus({ preventScroll: true });
  $('captionScroll').scrollTop = $('captionScroll').scrollHeight;
}
function hasUnsavedWork() {
  return (
    messages.length > 0 ||
    ['reply', 'manualDoctor', 'notes', 'callUrl'].some((id) => $(id).value.trim())
  );
}
let destination = null;
$('openSettings').onclick = () => {
  $('settingsDialog').showModal();
  status($('status').textContent, $('status').classList.contains('error'));
};
$('closeSettings').onclick = () => $('settingsDialog').close();
$('cancelManual').onclick = () => $('manualDialog').close();
$('cancelLeave').onclick = () => {
  destination = null;
  $('leaveDialog').close();
};
$('confirmLeave').onclick = () => {
  const href = destination;
  destination = null;
  $('clearSession').click();
  if (href) location.assign(href);
};
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (
    !link ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    link.target === '_blank' ||
    link.hasAttribute('download') ||
    !hasUnsavedWork()
  )
    return;
  const url = new URL(link.href);
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  event.preventDefault();
  destination = url.href;
  $('leaveDialog').showModal();
});
window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedWork()) return;
  event.preventDefault();
  event.returnValue = '';
});
function refreshVoices() {
  voices = synth
    ? synth.getVoices().filter((v) => v.localService === true && /^fr(?:-|_|$)/i.test(v.lang))
    : [];
  const ready = voices.length > 0;
  $('speakReply').disabled = !ready;
  $('readGuide').disabled = !ready;
  $('quickVoiceTest').disabled = !ready;
  $('activeVoiceLabel').textContent = ready
    ? 'Voix française de cet appareil'
    : 'Aucune voix française locale détectée';
  $('readNotes').disabled = !ready || !$('reviewed').checked || !$('notes').value.trim();
}
async function speak(text) {
  const value = text.trim();
  if (!value) {
    status('Écrivez un texte avant de le faire lire.', true);
    return false;
  }
  const voice = voices[0];
  if (!synth || !voice) {
    status(
      'Aucune voix française locale disponible. Votre texte peut être affiché à l’écran.',
      true,
    );
    return false;
  }
  pauseCaptions(false, false);
  stopSpeech();
  const u = new SpeechSynthesisUtterance(value);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1;
  utterance = u;
  micState('Microphone coupé');
  u.onend = () => {
    if (utterance !== u) return;
    utterance = null;
    micState('Microphone coupé');
  };
  u.onerror = () => {
    if (utterance !== u) return;
    utterance = null;
    micState('Microphone coupé');
  };
  try {
    synth.speak(u);
    status(
      'Lecture vocale activée. Les sous-titres sont en pause ; relancez-les ensuite si nécessaire.',
    );
    return true;
  } catch {
    utterance = null;
    micState('Microphone coupé');
    status('La lecture vocale est indisponible.', true);
    return false;
  }
}
async function startCaptions() {
  try {
    checkDemo();
    if (
      sessionPlatform !== 'office' &&
      (!sharedStream || sharedStream.getAudioTracks()[0]?.readyState !== 'live')
    )
      throw new Error(
        'Connectez d’abord le son de l’onglet de votre appel. Le microphone ne remplace pas le son d’une visioconférence.',
      );
    if (!Recognition)
      throw new Error(
        'Ce navigateur ne propose pas de reconnaissance vocale. Utilisez la saisie manuelle.',
      );
    if (!$('consent').checked)
      throw new Error('Confirmez l’accord des personnes présentes avant d’activer le microphone.');
    const local = $('recognitionMode').value === 'local';
    if (!local && !$('remoteConsent').checked)
      throw new Error(
        'Acceptez explicitement le traitement audio par le service du navigateur, ou gardez le mode local.',
      );
    stopSpeech();
    const token = ++generation;
    captionFatal = false;
    silentRestarts = 0;
    clearCaptionRetry();
    clearCaptionWatch();
    const previous = recognition;
    recognition = null;
    try {
      previous?.abort();
    } catch {}
    starting = true;
    micState('Vérification du service…');
    const r = new Recognition();
    r.lang = 'fr-FR';
    r.interimResults = true;
    r.maxAlternatives = 1;
    if (local) {
      if (!('processLocally' in r))
        throw new Error(
          'La reconnaissance sur cet appareil n’est pas prise en charge. Aucun audio n’a été envoyé. Utilisez la saisie manuelle ou choisissez le service du navigateur.',
        );
      r.processLocally = true;
      if (typeof Recognition.available === 'function') {
        const available = await Recognition.available({ langs: ['fr-FR'], processLocally: true });
        if (token !== generation) return;
        if (available !== 'available') {
          $('installLanguage').hidden =
            !['downloadable', 'downloading'].includes(available) ||
            typeof Recognition.install !== 'function';
          $('moreOptions').open = true;
          if (!$('settingsDialog').open) $('settingsDialog').showModal();
          throw new Error(
            available === 'unavailable'
              ? 'Aucun pack français local compatible. Aucun envoi vers un service distant.'
              : 'Le pack français doit être installé avant de démarrer les sous-titres.',
          );
        }
      }
    } else if ('processLocally' in r) r.processLocally = false;
    if (token !== generation || !$('consent').checked) return;
    r.continuous = !local;
    recognition = r;
    const keepCaptionSession = () =>
      $('consent').checked &&
      ($('recognitionMode').value !== 'browser' || $('remoteConsent').checked) &&
      (sessionPlatform === 'office' || sharedStream?.getAudioTracks()[0]?.readyState === 'live');
    const localStalled = () =>
      sessionPlatform === 'office' &&
      local &&
      silentRestarts >= 1 &&
      !messages.some((m) => m.speaker === 'captured' && !m.demo);
    const stalledCopy =
      'Le mode sur cet appareil n’écrit aucune phrase. Cliquez sur « Écrire avec le service vocal du navigateur », juste sous ce message.';
    r.onstart = () => {
      if (recognition !== r) return;
      starting = false;
      listening = true;
      micState(sharedStream ? 'Son de l’onglet actif' : 'Microphone actif', true);
      updateConnection();
      if (local) armCaptionWatch(r, token);
      if (localStalled()) {
        offerBrowserSpeech(true);
        captionHint(stalledCopy);
        status(stalledCopy, true);
        return;
      }
      offerBrowserSpeech(false);
      if (sharedStream)
        captionHint(
          'Votre propre microphone n’est pas sous-titré. Seule la voix des autres, jouée dans l’onglet de l’appel, peut s’afficher ici.',
        );
      status(
        sharedStream
          ? 'Sous-titres de l’onglet partagé. Votre propre microphone n’y est pas inclus.'
          : 'Microphone actif' +
              (local
                ? ' · une phrase à la fois, sur cet appareil.'
                : ' · traitement par le service vocal du navigateur.'),
      );
    };
    r.onresult = (e) => {
      if (recognition !== r || !listening) return;
      let interim = '';
      try {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal && text.trim()) {
            silentRestarts = 0;
            offerBrowserSpeech(false);
            append(text, 'captured');
          } else interim += text;
        }
        $('interim').textContent = interim;
        $('captionScroll').scrollTop = $('captionScroll').scrollHeight;
        if ((interim.trim() || messages.some((m) => m.speaker === 'captured' && !m.demo)) && local)
          armCaptionWatch(r, token);
      } catch (error) {
        pauseCaptions(false);
        status(error.message, true);
      }
    };
    r.onerror = (e) => {
      if (recognition !== r) return;
      if ((e.error === 'no-speech' || e.error === 'aborted') && keepCaptionSession()) return;
      captionFatal = true;
      pauseCaptions(false, false);
      status(speechError(e.error), true);
    };
    r.onend = () => {
      if (recognition !== r) return;
      clearCaptionWatch();
      if (captionFatal || !keepCaptionSession()) {
        recognition = null;
        starting = false;
        listening = false;
        $('interim').textContent = '';
        micState(sharedStream ? 'Son d’onglet connecté · en pause' : 'Microphone coupé');
        updateConnection();
        status(
          sharedStream
            ? 'Les sous-titres se sont arrêtés. Le son de l’appel reste audible ici. Cliquez sur « Démarrer les sous-titres ».'
            : 'L’écoute s’est arrêtée. Relancez les sous-titres pour reprendre ; aucun redémarrage automatique.',
        );
        return;
      }
      listening = false;
      starting = false;
      if (messages.some((m) => m.speaker === 'captured' && !m.demo)) silentRestarts = 0;
      else silentRestarts++;
      micState(sharedStream ? 'Son de l’onglet actif' : 'Microphone actif', true);
      updateConnection();
      if (localStalled()) {
        offerBrowserSpeech(true);
        captionHint(stalledCopy);
        status(stalledCopy, true);
      } else
        status(
          sessionPlatform === 'office'
            ? 'Microphone du cabinet ouvert. Les sous-titres reprennent dès qu’une phrase est entendue.'
            : 'En attente de parole dans l’onglet. L’écoute reprend sur le même son.',
        );
      const retryToken = token;
      captionRetry = setTimeout(() => {
        captionRetry = null;
        if (recognition !== r || retryToken !== generation || captionFatal || !keepCaptionSession())
          return;
        try {
          if (sharedStream) r.start(sharedStream.getAudioTracks()[0]);
          else r.start();
        } catch {
          captionFatal = true;
          pauseCaptions(false, false);
          status(
            'La reprise des sous-titres a échoué. Cliquez sur « Démarrer les sous-titres ».',
            true,
          );
        }
      }, 400);
    };
    if (sharedStream) r.start(sharedStream.getAudioTracks()[0]);
    else r.start();
  } catch (error) {
    pauseCaptions(false, false);
    status(error.message || 'Le service vocal est indisponible.', true);
  }
}
$('startCaptions').onclick = startCaptions;
$('pauseCaptions').onclick = () => pauseCaptions();
$('useBrowserSpeech').onclick = () => {
  pauseCaptions(false, false);
  $('moreOptions').open = true;
  $('recognitionMode').value = 'browser';
  $('remoteConsentLabel').hidden = false;
  $('remoteConsent').checked = true;
  $('recognitionHelp').textContent =
    'Ce mode peut transmettre l’audio au fournisseur du navigateur. AccèsCheck ne reçoit pas cet audio. Son traitement dépend du navigateur.';
  startCaptions();
};
$('recognitionMode').onchange = () => {
  pauseCaptions(false, false);
  const remote = $('recognitionMode').value === 'browser';
  $('remoteConsentLabel').hidden = !remote;
  $('remoteConsent').checked = false;
  $('installLanguage').hidden = true;
  $('recognitionHelp').textContent = remote
    ? 'Ce mode peut transmettre l’audio au fournisseur du navigateur. AccèsCheck ne reçoit pas cet audio. Son traitement dépend du navigateur.'
    : 'Aucun envoi audio via AccèsCheck. Le mode local nécessite un navigateur et un pack français compatibles.';
  status('Mode modifié. Le microphone reste coupé.');
};
$('consent').onchange = () => {
  if (!$('consent').checked) pauseCaptions();
};
$('remoteConsent').onchange = () => {
  if (!$('remoteConsent').checked) pauseCaptions();
};
$('installLanguage').onclick = async () => {
  const b = $('installLanguage');
  b.disabled = true;
  try {
    if (typeof Recognition?.install !== 'function') throw new Error('Installation indisponible.');
    status('Téléchargement du pack français. Aucun microphone activé.');
    const ok = await Recognition.install({ langs: ['fr-FR'], processLocally: true });
    if (!ok) throw new Error('Le pack français n’a pas pu être installé.');
    b.hidden = true;
    status('Pack installé. Vous pouvez démarrer les sous-titres.');
  } catch (e) {
    status(e.message, true);
  } finally {
    b.disabled = false;
  }
};
$('showReply').onclick = () => {
  try {
    checkDemo();
    append($('reply').value, 'patient');
    $('reply').value = '';
    showLatestMessage();
    status('Message affiché. Aucun son n’a été joué.');
  } catch (e) {
    status(e.message, true);
  }
};
$('speakReply').onclick = async () => {
  try {
    checkDemo();
    const text = validateMessage($('reply').value);
    if (!voices.length) throw new Error('Aucune voix française locale disponible.');
    append(text, 'patient');
    showLatestMessage();
    if (await speak(text)) $('reply').value = '';
  } catch (e) {
    status(e.message, true);
  }
};
document.querySelectorAll('[data-phrase]').forEach(
  (b) =>
    (b.onclick = () => {
      $('reply').value = b.dataset.phrase;
      $('reply').focus();
      status('Phrase préparée. Choisissez « Afficher » ou « Lire ma réponse ».');
    }),
);
$('manualToggle').onclick = () => {
  $('manualDialog').querySelector('.dialog-status').hidden = true;
  $('manualDialog').showModal();
  $('manualDoctor').focus();
};
$('addDoctor').onclick = () => {
  try {
    checkDemo();
    append($('manualDoctor').value, 'doctor');
    $('manualDoctor').value = '';
    $('manualDialog').close();
    showLatestMessage();
    status('Phrase du soignant ajoutée manuellement.');
  } catch (e) {
    status(e.message, true);
  }
};
$('loadDemo').onclick = () => {
  pauseCaptions(false);
  stopSpeech();
  demoActive = true;
  append('Bonjour. Qu’aimeriez-vous aborder pendant cette consultation ?', 'doctor', true);
  append('Pouvez-vous parler plus lentement ? Je lis les sous-titres.', 'patient', true);
  append(
    'Bien sûr. Nous pouvons prendre le temps de lire et de corriger les phrases ensemble.',
    'doctor',
    true,
  );
  status(
    'Exemple fictif affiché. Aucun microphone activé. Effacez la session avant un échange réel.',
  );
  showLatestMessage();
};
$('clearSession').onclick = () => {
  pauseCaptions(false);
  stopSpeech();
  messages = [];
  nextId = 1;
  demoActive = false;
  editingId = null;
  for (const id of ['reply', 'manualDoctor', 'notes', 'editText']) $(id).value = '';
  $('consent').checked = false;
  $('remoteConsent').checked = false;
  $('callUrl').value = '';
  updateCallLink();
  $('reviewed').checked = false;
  $('readNotes').disabled = true;
  $('notesWarning').textContent = '';
  $('editDialog').close();
  $('replaceDialog').close();
  $('manualDialog').close();
  $('leaveDialog').close();
  captionHint();
  render();
  status(
    'Session effacée. Le microphone est coupé ; les messages et notes ont été supprimés de cette page.',
  );
  window.dispatchEvent(new Event('accescompanion:session-cleared'));
};
$('saveEdit').onclick = () => {
  try {
    const text = validateMessage($('editText').value);
    const m = messages.find((m) => m.id === editingId);
    if (m) {
      m.text = text;
      m.corrected = true;
      invalidateNotes();
      render();
    }
    $('editText').value = '';
    $('editDialog').close();
    $('transcript').querySelector(`[data-message-id="${editingId}"]`)?.focus();
    status('Phrase corrigée. Vérifiez le sens avec la personne qui l’a prononcée.');
  } catch (e) {
    status(e.message, true);
  }
};
$('cancelEdit').onclick = () => $('editDialog').close();
function tab(name) {
  const notes = name === 'notes';
  if (notes) {
    pauseCaptions(false, false);
    status('Sous-titres en pause pendant la relecture de vos notes.');
  }
  for (const [id, on] of [
    ['conversationTab', !notes],
    ['notesTab', notes],
  ]) {
    $(id).setAttribute('aria-selected', String(on));
    $(id).tabIndex = on ? 0 : -1;
  }
  $('conversationPanel').hidden = notes;
  $('notesPanel').hidden = !notes;
}
$('conversationTab').onclick = () => tab('conversation');
$('notesTab').onclick = () => tab('notes');
document.querySelector('[role=tablist]').onkeydown = (e) => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const notes =
      e.key === 'End' ||
      (e.key !== 'Home' && $('conversationTab').getAttribute('aria-selected') === 'true');
    tab(notes ? 'notes' : 'conversation');
    $(notes ? 'notesTab' : 'conversationTab').focus();
  }
};
function draft() {
  const text = buildDraft(messages);
  if (!text) {
    $('notesWarning').textContent =
      'Ajoutez une phrase à la conversation avant de préparer vos notes.';
    return;
  }
  if (text.length > 24000) {
    $('notesWarning').textContent =
      'Cet échange est trop long pour le brouillon. Rédigez un récapitulatif dans le champ ci-dessous.';
    return;
  }
  stopSpeech();
  $('notes').value = text;
  $('reviewed').checked = false;
  $('readNotes').disabled = true;
  $('notesWarning').textContent =
    'Brouillon copié mot pour mot. Corrigez les erreurs et résumez-le avec le soignant avant de le valider.';
}
$('draftNotes').onclick = () => {
  if ($('notes').value.trim() && messages.length) $('replaceDialog').showModal();
  else draft();
};
$('confirmDraft').onclick = () => {
  draft();
  $('replaceDialog').close();
};
$('cancelDraft').onclick = () => $('replaceDialog').close();
$('notes').oninput = () => {
  stopSpeech();
  $('reviewed').checked = false;
  $('readNotes').disabled = true;
  $('notesWarning').textContent = 'Notes modifiées : relisez-les avant la lecture vocale.';
};
$('reviewed').onchange = () => {
  $('readNotes').disabled = !$('reviewed').checked || !$('notes').value.trim() || !voices.length;
  if (!$('reviewed').checked) stopSpeech();
};
$('readNotes').onclick = () => {
  if ($('reviewed').checked) speak($('notes').value);
};
$('copyNotes').onclick = async () => {
  if (!$('notes').value.trim()) {
    $('notesWarning').textContent = 'Écrivez ou préparez vos notes avant de les copier.';
    return;
  }
  try {
    await navigator.clipboard.writeText(
      'NOTES PERSONNELLES ' +
        ($('reviewed').checked ? '— relues' : '— NON VALIDÉES') +
        '\n\n' +
        $('notes').value,
    );
    $('notesWarning').textContent =
      'Notes copiées à votre demande. Elles peuvent contenir des informations de santé.';
  } catch {
    $('notesWarning').textContent =
      'Copie indisponible. Sélectionnez vos notes et copiez-les manuellement.';
  }
};
$('readGuide').onclick = () =>
  speak(
    'Vous êtes dans l’échange AccèsCheck. Le bouton Démarrer les sous-titres active l’écoute après votre accord. Dans Votre réponse, écrivez une phrase, puis choisissez Afficher ou Lire ma réponse. Le médecin entend cette voix seulement si l’appareil est près de lui, ou si le son de cette page est partagé dans l’appel. Cette lecture ne décrit pas votre environnement physique.',
  );
if (synth) synth.addEventListener('voiceschanged', refreshVoices);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopSpeech();
    if (!sharedStream) {
      pauseCaptions(false);
      status('La page a quitté le premier plan. Microphone et lecture arrêtés.');
    }
  } else if (callMonitor?.state === 'suspended') callMonitor.resume?.();
});
window.addEventListener('pagehide', () => {
  $('clearSession').onclick();
});
$('supportInfo').textContent = Recognition
  ? 'Le microphone ne démarre jamais automatiquement. En cas d’indisponibilité, utilisez « Saisir aussi les paroles du soignant ».'
  : 'Reconnaissance vocale indisponible dans ce navigateur. La saisie manuelle reste utilisable.';
micState('Microphone coupé');
refreshVoices();

function updateConnection() {
  const connected = !!sharedStream;
  $('connectionBadge').classList.toggle('connected', connected);
  $('connectionBadge').textContent = connected
    ? listening
      ? 'Son d’onglet · sous-titres actifs'
      : 'Son d’onglet · prêt'
    : sessionPlatform === 'office'
      ? 'Microphone de cet appareil'
      : 'Son de l’appel non connecté';
  $('callAudioStatus').textContent = connected
    ? 'Vous entendez cet appel sur cette page. Laissez AccèsCheck ouvert à côté de la vidéo.'
    : supportsCallAudio(navigator.userAgent, !!navigator.mediaDevices?.getDisplayMedia)
      ? 'Aucun son d’appel connecté. Choisissez l’onglet de la vidéo, pas la fenêtre entière, et cochez « Partager l’audio de l’onglet ».'
      : 'Le partage du son d’un onglet nécessite Chrome ou Edge récent sur ordinateur. La saisie manuelle reste disponible.';
  if ($('hearingStatus'))
    $('hearingStatus').textContent =
      sessionPlatform === 'office'
        ? 'En cabinet, le médecin entend la voix de cet appareil s’il est près de vous.'
        : !connected
          ? 'Le son de l’appel n’est pas connecté. Coller le lien ne suffit pas : cliquez sur « Connecter le son de l’appel », choisissez l’onglet Zoom ou Doctolib, et cochez « Partager l’audio de l’onglet ».'
          : listening
            ? 'Vous entendez l’appel sur cette page et les sous-titres sont actifs. Laissez cette page ouverte à côté de la vidéo.'
            : 'L’appel est connecté et audible sur cette page. Démarrez les sous-titres pour afficher les paroles.';
  $('connectCallAudio').disabled = !supportsCallAudio(
    navigator.userAgent,
    !!navigator.mediaDevices?.getDisplayMedia,
  );
}
function updateCallLink() {
  const href = safeCallUrl($('callUrl').value, sessionPlatform);
  $('openCall').href = href || '#';
  $('openCall').setAttribute('aria-disabled', String(!href));
}
document.querySelectorAll('[data-platform]').forEach(
  (b) =>
    (b.onclick = () => {
      pauseCaptions(false);
      stopSpeech();
      sessionPlatform = b.dataset.platform;
      document
        .querySelectorAll('[data-platform]')
        .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('videoSetup').hidden = sessionPlatform === 'office';
      $('callUrl').value = '';
      updateCallLink();
      $('platformHelp').textContent =
        sessionPlatform === 'office'
          ? 'Placez cet appareil entre vous et le médecin. Le microphone capte les voix dans la pièce.'
          : 'Ouvrez ' +
            (sessionPlatform === 'zoom' ? 'Zoom' : 'Doctolib') +
            ' dans un autre onglet. Ici, choisissez cet onglet-là et cochez « Partager l’audio de l’onglet ». Ne choisissez pas la page AccèsCheck : elle n’a pas le son de l’appel.';
      updateConnection();
      status('Mode de consultation modifié. Aucune capture audio active.');
    }),
);
$('callUrl').oninput = updateCallLink;
$('openCall').onclick = (e) => {
  const href = safeCallUrl($('callUrl').value, sessionPlatform);
  if (!href) {
    e.preventDefault();
    status(
      'Collez un lien HTTPS de ' +
        (sessionPlatform === 'zoom' ? 'Zoom' : 'Doctolib') +
        ' pour ouvrir votre rendez-vous.',
      true,
    );
  } else status('Votre appel s’ouvre dans un autre onglet. Revenez ici pour connecter son audio.');
};
$('connectCallAudio').onclick = async () => {
  let stream = null;
  try {
    checkDemo();
    if (!$('consent').checked)
      throw new Error('Confirmez l’accord des personnes présentes avant de partager le son.');
    if (!supportsCallAudio(navigator.userAgent, !!navigator.mediaDevices?.getDisplayMedia))
      throw new Error('Le partage du son nécessite Chrome ou Edge récent sur ordinateur.');
    pauseCaptions(false);
    const token = ++connectionGeneration;
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { suppressLocalAudioPlayback: true },
      selfBrowserSurface: 'exclude',
      systemAudio: 'include',
      surfaceSwitching: 'exclude',
    });
    if (token !== connectionGeneration) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const video = stream.getVideoTracks()[0];
    const audio = stream.getAudioTracks()[0];
    if (video?.getSettings().displaySurface !== 'browser')
      throw new Error('Choisissez un onglet du navigateur, pas une fenêtre ou l’écran entier.');
    if (!audio || audio.readyState !== 'live')
      throw new Error('Aucun son partagé. Réessayez en cochant « Partager l’audio de l’onglet ».');
    try {
      video.stop();
    } catch {}
    if (audio.readyState !== 'live')
      throw new Error(
        'Le son de l’onglet s’est arrêté avec l’image. Réessayez en cochant « Partager l’audio de l’onglet ».',
      );
    sharedStream = stream;
    hearSharedCall(stream);
    audio.onended = () => {
      if (sharedStream !== stream) return;
      pauseCaptions(false);
      status('Le partage a été arrêté. Aucun son d’appel n’est capté.');
    };
    $('disconnectCallAudio').disabled = false;
    updateConnection();
    micState('Son d’onglet connecté · en pause');
    status('Son de l’appel connecté. Vous l’entendez sur cette page.');
    await startCaptions();
  } catch (e) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    releaseSharedAudio();
    status(
      e.name === 'NotAllowedError'
        ? 'Partage annulé ou refusé. Aucun son d’appel connecté.'
        : e.message || 'Le partage du son est indisponible.',
      true,
    );
  }
};
$('disconnectCallAudio').onclick = () => pauseCaptions();
$('copyReplyForCall').onclick = async () => {
  try {
    const text = validateMessage($('reply').value);
    await navigator.clipboard.writeText(text);
    status('Réponse copiée. Collez-la vous-même dans le chat de votre appel.');
  } catch (e) {
    status(e.message || 'Copie indisponible. Sélectionnez votre réponse manuellement.', true);
  }
};
(async () => {
  const id = new URLSearchParams(location.search).get('practice');
  if (!id) return;
  try {
    const r = await fetch('/api/practice?id=' + encodeURIComponent(id));
    if (!r.ok) return;
    const p = await r.json();
    $('practiceName').textContent = p.name;
    $('practiceAddress').textContent = p.address;
    $('practiceContext').hidden = false;
    const href = safeCallUrl(p.doctolibUrl, 'doctolib');
    if (href) {
      $('practiceDoctolib').href = href;
      $('practiceDoctolib').hidden = false;
    }
  } catch {}
})();
updateConnection();

$('quickVoiceTest').onclick = () =>
  speak('Bonjour. Cette voix française peut lire vos messages pendant votre rendez-vous.');

// Explicit interface for the local developer bridge. Real messages are never shared.
window.accescompanionSession = Object.freeze({
  hasRealMessages: () => messages.some((message) => !message.demo),
  getFictionalMessages() {
    if (messages.some((message) => !message.demo)) {
      throw new Error('Seuls les messages fictifs peuvent être partagés.');
    }
    return messages.map((message) => ({ ...message }));
  },
  loadExample: () => $('loadDemo').click(),
  prepareReadingMode(mode) {
    $('settingsDialog').close();
    tab('conversation');
    document.body.classList.toggle('vision', mode === 'vision');
    const target =
      mode === 'speak' ? 'reply' : mode === 'vision' ? 'captionScroll' : 'startCaptions';
    $(target).focus();
  },
  applyDraft(text) {
    if ($('notes').value.trim()) return false;
    if (typeof text !== 'string' || text.length > 24000) {
      throw new Error('Brouillon invalide.');
    }
    tab('notes');
    $('settingsDialog').close();
    $('notes').value = text;
    $('notes').dispatchEvent(new Event('input'));
    return true;
  },
  async speakApprovedReply(text) {
    if (!demoActive || messages.some((message) => !message.demo)) {
      throw new Error('La lecture MCP est réservée au test fictif.');
    }
    const value = validateMessage(text);
    const played = await speak(value);
    if (played) {
      append(value, 'patient', true);
      $('settingsDialog').close();
      showLatestMessage();
    }
    return played;
  },
  clear: () => $('clearSession').click(),
});
