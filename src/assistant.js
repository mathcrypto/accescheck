import { criteria } from './core.mjs';
import { practiceCard } from './search-results.js';
const $ = (id) => document.getElementById(id);
let state = null;
let controller = null;
function node(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function turn(text, who = 'agent') {
  const bubble = node('div', '', 'bubble ' + who);
  bubble.append(node('p', text));
  $('thread').append(bubble);
  return bubble;
}
function clearResults() {
  $('resultsSection').hidden = true;
  $('results').replaceChildren();
  $('pagination').replaceChildren();
}
function actions(bubble, values) {
  const group = node('div', '', 'chat-choices');
  for (const value of values) {
    const button = node('button', value.label, 'secondary');
    button.type = 'button';
    button.onclick = () => (value.id === 'clear' ? $('clear').click() : ask({ action: value.id }));
    group.append(button);
  }
  bubble.append(group);
  return group;
}
async function post(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Service indisponible. Réessayez.');
  return data;
}
async function ask(input) {
  controller?.abort();
  const active = (controller = new AbortController());
  clearResults();
  document.querySelectorAll('.chat-choices button').forEach((button) => (button.disabled = true));
  $('chatStatus').textContent =
    input.action === 'confirm' ? 'Recherche des cabinets…' : 'Lecture de votre message…';
  $('thread').setAttribute('aria-busy', 'true');
  if (input.message) turn(input.message, 'user');
  try {
    if (input.action === 'confirm') {
      const result = await post(
        '/api/discover',
        {
          confirmed: true,
          needs: state.needs,
          specialty: state.specialty,
          origin: state.origin,
          radiusKm: state.radiusKm ?? (state.origin ? 5 : null),
          page: input.page || 1,
        },
        active.signal,
      );
      if (active !== controller) return;
      $('resultsSection').hidden = false;
      $('results').replaceChildren(
        ...result.results.map((practice) => practiceCard(practice, result.origin)),
      );
      const page = input.page || 1;
      const pages = [];
      if (page > 1) pages.push({ label: '← Précédent', id: String(page - 1) });
      if (page * result.pageSize < result.total)
        pages.push({ label: 'Résultats suivants →', id: String(page + 1) });
      const navigation = actions($('pagination'), pages);
      [...navigation.children].forEach((button, index) => {
        button.onclick = () => ask({ action: 'confirm', page: Number(pages[index].id) });
      });
      $('resultsSummary').textContent =
        result.total +
        ' fiche(s). Accessibilité, puis proximité. Les inconnus restent à confirmer.';
      turn(
        result.total
          ? 'Voici les cabinets correspondant à votre recherche. Vous pouvez préciser ou corriger votre demande.'
          : 'Aucune fiche pour ces critères. Vous pouvez préciser ou élargir votre demande.',
      );
    } else {
      const data = await post(
        '/api/agent',
        { ...input, state, consent: $('consent').checked, reviewOnly: true },
        active.signal,
      );
      if (active !== controller) return;
      state = data.state;
      const summary = [
        state.specialty,
        state.origin?.label || state.placeQuery,
        ...state.needs.keys.map((key) => criteria[key].label),
      ]
        .filter(Boolean)
        .join(' · ');
      const bubble = turn(summary + '\n' + data.reply);
      actions(bubble, data.actions || []);
    }
    $('chatStatus').textContent = '';
  } catch (error) {
    if (active !== controller || error.name === 'AbortError') return;
    $('chatStatus').textContent = error.message;
    const retry = actions(turn(error.message), [{ id: 'retry', label: 'Réessayer' }]);
    retry.firstElementChild.onclick = () => ask(input);
  } finally {
    if (active === controller) $('thread').setAttribute('aria-busy', 'false');
  }
}
$('descriptionForm').onsubmit = (event) => {
  event.preventDefault();
  const message = $('description').value.trim();
  if (!message) return;
  $('description').value = '';
  ask({ message });
};
$('clear').onclick = () => {
  controller?.abort();
  controller = null;
  state = null;
  $('thread').replaceChildren();
  $('thread').setAttribute('aria-busy', 'false');
  $('descriptionForm').reset();
  $('consent').checked = false;
  clearResults();
  $('chatStatus').textContent = 'Conversation effacée.';
  $('description').focus();
};
fetch('/api/ai-config')
  .then((response) => response.json())
  .then((config) => {
    $('consent').disabled = !config.available;
    $('aiStatus').textContent = config.available
      ? 'OpenAI disponible avec votre accord.'
      : 'OpenAI indisponible. La recherche locale fonctionne.';
  })
  .catch(() => {
    $('consent').disabled = true;
    $('aiStatus').textContent = 'La recherche locale reste disponible.';
  });
