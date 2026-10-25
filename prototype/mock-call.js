const audio = document.getElementById('doctorAudio'),
  status = document.getElementById('audioStatus'),
  timer = document.getElementById('callTimer'),
  progress = document.getElementById('playProgress');
const clock = (s) => '00:' + String(Math.floor(Number.isFinite(s) ? s : 0)).padStart(2, '0');
function updateTime() {
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 13.71;
  timer.textContent = clock(audio.currentTime) + ' / ' + clock(Math.ceil(duration));
  progress.style.width = Math.min(100, (audio.currentTime / duration) * 100) + '%';
}
document.getElementById('play').onclick = async () => {
  try {
    if (audio.ended) audio.currentTime = 0;
    await audio.play();
    if (audio.duration === 0)
      status.textContent =
        'Le fichier audio est vide ou ancien. Actualisez cette page avant de réessayer.';
  } catch {
    status.textContent =
      'La lecture est bloquée. Cliquez à nouveau sur le bouton ou vérifiez les autorisations audio.';
  }
};
document.getElementById('pause').onclick = () => audio.pause();
document.getElementById('restart').onclick = () => {
  audio.pause();
  audio.currentTime = 0;
  updateTime();
  status.textContent = 'Prêt à recommencer. Relancez la voix quand les sous-titres sont actifs.';
};
audio.onplay = () => {
  document.body.classList.add('playing');
  status.textContent =
    'Voix de démonstration en cours. Retrouvez les paroles dans la page « L’échange ».';
};
audio.onpause = () => {
  document.body.classList.remove('playing');
  status.textContent = audio.ended
    ? 'Exemple terminé. Vous pouvez le rejouer ou essayer une réponse dans la page « L’échange ».'
    : 'Voix en pause. Reprenez la lecture quand vous le souhaitez.';
};
audio.ontimeupdate = updateTime;
audio.onloadedmetadata = () => {
  updateTime();
  if (audio.duration === 0)
    status.textContent = 'L’audio de test n’est pas chargé. Actualisez cette page.';
};
audio.onerror = () =>
  (status.textContent =
    'Audio indisponible. Vérifiez que le serveur local est démarré, puis actualisez.');
window.addEventListener('pagehide', () => audio.pause());
