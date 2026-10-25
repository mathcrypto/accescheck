import { renderMessage, renderRecap } from './chat-content.js';
import { rankByReputation } from './review-core.mjs';
import { readChatResponse } from './chat-events.mjs';
import { mountReviewCards } from './review-cards.js';
import { practiceCard } from './search-results.js';
import { collectVisibleText, speakEdge, stopSpeechPlayback } from './page-speech.js';
let readController = null;
const $ = (id) => document.getElementById(id);
let state = null;
let controller = null;
let lastInput = null;
let lastLabel = '';
let reviewJob = null;
let reviewsAvailable = false;
let directoryMode = false;
const reviewCache = new Map();
let pageReading = false;
function node(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function turn(text, who = 'agent') {
  const bubble = node('div', '', 'bubble ' + who);
  bubble.append(node('p', who === 'user' ? 'Vous' : 'AccèsCheck', 'who'));
  const content = node(who === 'user' ? 'p' : 'div', '', 'say');
  if (who === 'user') content.textContent = text;
  else renderMessage(content, text);
  bubble.append(content);
  $('thread').append(bubble);
  return bubble;
}
function setResultsMode(on, summary = '') {
  $('searchPanel').classList.toggle('has-results', on);
  $('chatFold').open = !on;
  $('chatFoldSummary').hidden = !on;
  if (on) {
    $('chatFoldSummary').textContent = 'Voir la conversation et les critères';
    $('resultsCriteria').hidden = !summary;
    if (summary) renderRecap($('resultsCriteria'), summary);
    else $('resultsCriteria').replaceChildren();
  } else {
    $('resultsCriteria').hidden = true;
    $('resultsCriteria').textContent = '';
  }
}
function clearResults() {
  setResultsMode(false);
  $('resultsSection').hidden = true;
  $('results').replaceChildren();
  $('pagination').replaceChildren();
}
function actions(bubble, values) {
  const group = node('div', '', 'chat-choices');
  for (const value of values) {
    const button = node('button', value.label, 'secondary');
    button.type = 'button';
    button.onclick = () => {
      if (value.id === 'clear') return $('clear').click();
      if (value.id === 'consent') {
        $('consent').checked = true;
        return ask(lastInput, lastLabel);
      }
      return ask({ action: value.id });
    };
    group.append(button);
  }
  bubble.append(group);
  return group;
}
function question(bubble, question) {
  if (question.text && bubble.querySelector('.say')?.textContent !== question.text)
    bubble.append(node('p', question.text, 'question-text'));
  bubble.dataset.question = question.id;
  const choices = actions(
    bubble,
    question.options.map((option) => ({ id: option.value, label: option.label })),
  );
  [...choices.children].forEach((button, index) => {
    const option = question.options[index];
    button.onclick = () => {
      if (option.value === '__free__') return $('description').focus();
      ask({ answer: { field: question.id, value: option.value } }, option.label);
    };
  });
}

function working(active, text = '') {
  const activity = $('agentActivity');
  activity.hidden = !active;
  document.body.classList.toggle('agent-working', active);
  $('activityText').textContent = text;
  if (active) {
    const inResults = $('searchPanel').classList.contains('has-results');
    $(inResults ? 'resultStatus' : 'chatHistory').append(activity);
    if (!inResults) revealTurn(activity);
  }
}
function revealTurn(bubble) {
  bubble.scrollIntoView({ block: 'start', behavior: 'auto' });
}
function retry(input, text) {
  const bubble = turn(text);
  const choices = actions(bubble, [{ id: 'retry', label: 'Réessayer' }]);
  choices.firstElementChild.onclick = () => ask(input, lastLabel);
  revealTurn(bubble);
}

async function ask(input, choiceLabel = '') {
  reviewJob?.dispose();
  reviewJob = null;
  controller?.abort();
  const active = (controller = new AbortController());
  const displayedPracticeIds = [...$('results').children].map((card) => card.dataset.practice);
  if (state?.lastResults && displayedPracticeIds.length) input = { ...input, displayedPracticeIds };
  lastInput = input;
  lastLabel = choiceLabel;
  clearResults();
  document.querySelectorAll('.chat-choices button').forEach((button) => (button.disabled = true));
  $('chatStatus').textContent = '';
  let streamed = null;
  let practices = null;
  let automaticReviews = false;
  $('thread').setAttribute('aria-busy', 'true');
  if (input.message || choiceLabel) turn(input.message || choiceLabel, 'user');
  working(true, 'Envoi de la demande');
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({
        ...input,
        state,
        consent: $('consent').checked,
        reviewConsent: $('reviewConsent').checked,
      }),
      signal: active.signal,
    });
    const data = await readChatResponse(response, (event) => {
      if (active !== controller) return;
      if (event.type === 'status') working(true, event.text);
      if (event.type === 'reply') {
        streamed ||= turn('');
        streamed.querySelector('.say').append(document.createTextNode(event.delta));
      }
    });
    if (active !== controller) return;
    state = data.state;
    for (const review of data.reviews || []) reviewCache.set(review.practiceId, review);
    while (reviewCache.size > 50) reviewCache.delete(reviewCache.keys().next().value);
    directoryMode = data.mode === 'directory';
    const showingResults = Boolean(data.results);
    if (showingResults) {
      streamed?.remove();
      const result = data.results;
      practices = result.results;
      automaticReviews = result.page === 1 && $('reviewConsent').checked;
      setResultsMode(true, data.summary || '');
      $('resultsSection').hidden = false;
      practices = rankByReputation(practices, reviewCache);
      $('results').replaceChildren(
        ...practices.map((practice) => practiceCard(practice, result.origin, state?.notes || [])),
      );
      const page = result.page;
      const pages = [];
      if (page > 1) pages.push({ label: '← Précédent', id: String(page - 1) });
      if (page * result.pageSize < result.total)
        pages.push({ label: 'Résultats suivants →', id: String(page + 1) });
      const navigation = actions($('pagination'), pages);
      [...navigation.children].forEach(
        (button, index) =>
          (button.onclick = () =>
            ask({ action: directoryMode ? 'directory' : 'page', page: Number(pages[index].id) })),
      );
      renderMessage(
        $('resultsSummary'),
        [
          data.reply,
          data.notice,
          result.total +
            ' fiche(s) · page ' +
            result.page +
            '. Accessibilité, puis proximité, puis réputation si renseignée.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
      $('dataset').textContent =
        'Accès Libre · export du ' +
        new Date(result.dataset.exportedAt).toLocaleDateString('fr-FR') +
        '. ' +
        result.counts.knownObstaclesExcluded +
        ' obstacle(s) connu(s) exclu(s). Distances depuis votre adresse, aucun itinéraire vérifié.';
      $('chatStatus').textContent = '';
      $('resultsTitle').focus({ preventScroll: true });
      if (data.question) {
        question(turn(data.reply), data.question);
        $('chatFold').open = true;
      }
      $('resultsSection').scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    } else {
      setResultsMode(false);
      const bubble = streamed || turn('');
      renderMessage(bubble.querySelector('.say'), data.reply);
      if (data.summary && !data.question) {
        const recap = node('section', '', 'chat-recap');
        renderRecap(recap, data.summary);
        bubble.querySelector('.say').before(recap);
      }
      if (data.notice) bubble.append(node('p', data.notice, 'hint'));
      if (data.question) question(bubble, data.question);
      else actions(bubble, data.actions || []);
      $('chatStatus').textContent = '';
      revealTurn(bubble);
    }
  } catch (error) {
    if (active !== controller || error.name === 'AbortError') return;
    $('chatStatus').textContent = error.message;
    retry(input, error.message);
    actions(
      turn(
        'Vous pouvez aussi consulter les fiches publiques sans interprétation de votre demande.',
      ),
      [{ id: 'directory', label: 'Consulter l’annuaire public' }],
    );
  } finally {
    if (active === controller) {
      $('thread').setAttribute('aria-busy', 'false');
      working(false);
      if (practices)
        reviewJob = mountReviewCards(practices, {
          available: reviewsAvailable,
          automatic: automaticReviews,
          cache: reviewCache,
          onActivity: working,
          onUpdate: () => {
            const cards = new Map(
              [...$('results').children].map((card) => [card.dataset.practice, card]),
            );
            const focused = document.activeElement;
            for (const practice of rankByReputation(practices, reviewCache))
              $('results').append(cards.get(practice.id));
            if (focused?.isConnected && focused !== document.activeElement)
              focused.focus({ preventScroll: true });
          },
        });
    }
  }
}
$('visionMode').onchange = () => {
  const enabled = $('visionMode').checked;
  document.body.classList.toggle('vision', enabled);
  $('chatStatus').textContent = enabled
    ? 'Texte agrandi activé. Conversation, choix et fiches sont plus grands, avec un contraste renforcé.'
    : 'Affichage standard rétabli.';
};
function setPageReading(active) {
  pageReading = active;
  const button = $('readPage');
  if (!button) return;
  button.textContent = active ? 'Arrêter la lecture' : 'Lire la page';
  button.setAttribute('aria-pressed', String(active));
}
$('readPage').onclick = async () => {
  if (pageReading) {
    readController?.abort();
    readController = null;
    stopSpeechPlayback();
    setPageReading(false);
    return;
  }
  const text = collectVisibleText(
    ['.intro-copy', '#thread', '#resultsCriteria', '#resultsSummary', '#results', '#dataset'],
    { maxChars: 4000, cardLimit: 3 },
  );
  setPageReading(true);
  try {
    readController = new AbortController();
    await speakEdge(text, {
      signal: readController.signal,
      onEnd: () => setPageReading(false),
      onError: () => setPageReading(false),
    });
  } catch (error) {
    setPageReading(false);
    if (error.name !== 'AbortError') $('chatStatus').textContent = error.message;
  } finally {
    readController = null;
  }
};
$('descriptionForm').onsubmit = (event) => {
  event.preventDefault();
  const message = $('description').value.trim();
  if (!message) return;
  $('description').value = '';
  ask({ message });
};
$('clear').onclick = () => {
  reviewJob?.dispose();
  reviewJob = null;
  reviewCache.clear();
  $('reviewConsent').checked = false;
  controller?.abort();
  controller = null;
  state = null;
  lastInput = null;
  readController?.abort();
  readController = null;
  stopSpeechPlayback();
  setPageReading(false);
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
  if (reviewJob) {
    reviewJob.stop();
    $('chatStatus').textContent = 'Recherche d’avis interrompue. Les cabinets restent disponibles.';
    $('description').focus();
    return;
  }
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
    reviewsAvailable = config.available === true;
    $('reviewConsent').disabled = !reviewsAvailable;
    $('consent').disabled = !config.available;
    $('aiStatus').textContent = config.available
      ? 'OpenAI disponible avec votre accord.'
      : 'Agent indisponible. Annuaire public disponible en mode dégradé.';
  })
  .catch(() => {
    $('reviewConsent').disabled = true;
    $('consent').disabled = true;
    $('aiStatus').textContent = 'La recherche locale reste disponible.';
  });
