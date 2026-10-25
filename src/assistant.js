import { readChatResponse } from './chat-events.mjs';
import { practiceCard } from './search-results.js';
const $ = (id) => document.getElementById(id);
let state = null;
let controller = null;
let lastInput = null;
let lastLabel = '';
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
function working(active, text = '') {
  $('agentActivity').hidden = !active;
  document.body.classList.toggle('agent-working', active);
  $('activityText').textContent = text;
}
function retry(input, text) {
  const choices = actions(turn(text), [{ id: 'retry', label: 'Réessayer' }]);
  choices.firstElementChild.onclick = () => ask(input, lastLabel);
}

async function ask(input, choiceLabel = '') {
  controller?.abort();
  const active = (controller = new AbortController());
  lastInput = input;
  lastLabel = choiceLabel;
  clearResults();
  document.querySelectorAll('.chat-choices button').forEach((button) => (button.disabled = true));
  $('chatStatus').textContent = '';
  working(true, 'Envoi de la demande');
  let streamed = null;
  $('thread').setAttribute('aria-busy', 'true');
  if (input.message || choiceLabel) turn(input.message || choiceLabel, 'user');
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ ...input, state, consent: $('consent').checked }),
      signal: active.signal,
    });
    const data = await readChatResponse(response, (event) => {
      if (active !== controller) return;
      if (event.type === 'status') working(true, event.text);
      if (event.type === 'reply') {
        streamed ||= turn('');
        streamed.querySelector('p').append(document.createTextNode(event.delta));
      }
    });
    if (active !== controller) return;
    state = data.state;
    const bubble = streamed || turn('');
    bubble.querySelector('p').textContent =
      (data.question ? '' : data.summary + '\n\n') + data.reply;
    if (data.notice) bubble.append(node('p', data.notice, 'hint'));
    if (data.question) {
      bubble.dataset.question = data.question.id;
      const choices = actions(
        bubble,
        data.question.options.map((option) => ({ id: option.value, label: option.label })),
      );
      [...choices.children].forEach((button, index) => {
        const value = data.question.options[index].value;
        button.onclick = () => {
          if (value === '__free__') {
            $('description').focus();
            return;
          }
          ask({ answer: { field: data.question.id, value } }, data.question.options[index].label);
        };
      });
    } else actions(bubble, data.actions || []);
    if (data.results) {
      const result = data.results;
      $('resultsSection').hidden = false;
      $('results').replaceChildren(
        ...result.results.map((practice) => practiceCard(practice, result.origin, state.notes)),
      );
      const page = result.page;
      const pages = [];
      if (page > 1) pages.push({ label: '← Précédent', id: String(page - 1) });
      if (page * result.pageSize < result.total)
        pages.push({ label: 'Résultats suivants →', id: String(page + 1) });
      const navigation = actions($('pagination'), pages);
      [...navigation.children].forEach(
        (button, index) =>
          (button.onclick = () => ask({ action: 'page', page: Number(pages[index].id) })),
      );
      $('resultsSummary').textContent =
        result.total +
        ' fiche(s) · page ' +
        result.page +
        '. Accessibilité, puis proximité, puis réputation si renseignée. Les inconnus restent à confirmer.';
      $('dataset').textContent =
        'Accès Libre · export du ' +
        new Date(result.dataset.exportedAt).toLocaleDateString('fr-FR') +
        '. ' +
        result.counts.knownObstaclesExcluded +
        ' obstacle(s) connu(s) exclu(s). Distances à vol d’oiseau, aucun itinéraire vérifié.';
    }
    $('chatStatus').textContent = '';
    const history = $('chatHistory');
    const anchor = data.results ? $('resultsSection') : bubble;
    history.scrollTop +=
      anchor.getBoundingClientRect().top - history.getBoundingClientRect().top - 8;
  } catch (error) {
    if (active !== controller || error.name === 'AbortError') return;
    $('chatStatus').textContent = error.message;
    retry(input, error.message);
  } finally {
    if (active === controller) {
      $('thread').setAttribute('aria-busy', 'false');
      working(false);
    }
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
  lastInput = null;
  working(false);
  $('thread').replaceChildren();
  $('thread').setAttribute('aria-busy', 'false');
  $('descriptionForm').reset();
  $('consent').checked = false;
  clearResults();
  $('chatStatus').textContent = 'Conversation effacée.';
  $('description').focus();
};
$('stopSearch').onclick = () => {
  controller?.abort();
  controller = null;
  working(false);
  $('thread').setAttribute('aria-busy', 'false');
  $('chatStatus').textContent = 'Recherche interrompue.';
  if (lastInput) retry(lastInput, 'Vous pouvez reprendre cette demande ou écrire une correction.');
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
