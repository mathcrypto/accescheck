import { applyLanguage } from './i18n.js';
import './assistant.js';
import './ambient.js';

applyLanguage();

const motionButton = document.getElementById('pauseMotion');
motionButton.addEventListener('click', () => {
  const paused = document.body.classList.toggle('motion-paused');
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.textContent = paused ? 'Relancer les animations' : 'Mettre les animations en pause';
});

document.querySelector('.intro-link').addEventListener('click', () => {
  const mark = document.querySelector('.brand-mark');
  for (const animation of mark.getAnimations()) animation.cancel();
  if (
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !document.body.classList.contains('motion-paused')
  )
    mark.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: 900,
      easing: 'cubic-bezier(.2,.7,.2,1)',
    });
});

document.querySelectorAll('.menu a').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelector('.menu').open = false;
  });
});
