import { criteria, evidenceState, parseNeeds } from './core.mjs';

const $ = (id) => document.getElementById(id);
let controller = null;
let locationController = null;
let origin = null;
let proposal = null;
let confirmedInput = null;
let aiAvailable = false;
const date = (value) => new Date(value).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function sourceLink(label, value, hosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password)
      return null;
    const link = element('a', '', label);
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', label + ' (nouvel onglet)');
    return link;
  } catch {
    return null;
  }
}
async function api(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Service indisponible.');
  return result;
}
function status(id, text, error = false) {
  $(id).hidden = !text;
  $(id).textContent = text;
  $(id).classList.toggle('error', error);
}
function invalidate() {
  controller?.abort();
  const resultsSection = $('resultsSection');
  if (resultsSection) resultsSection.hidden = true;
  $('confirmed').checked = false;
  confirmedInput = null;
  $('results').replaceChildren();
  $('pagination').replaceChildren();
  $('resultsSummary').textContent =
    'Vérifiez puis confirmez vos critères pour lancer une recherche.';
  status('resultStatus', '');
  status('searchStatus', '');
}
function updateWidth() {
  const selected = !!$('criteria').querySelector('input[value="width"]:checked');
  $('widthField').hidden = !selected;
  $('minWidth').disabled = !selected;
}
function review(value) {
  proposal = value;
  invalidate();
  $('review').hidden = false;
  $('searchForm').hidden = false;
  $('proposalSource').textContent = value.parser;
  $('criteria').replaceChildren(element('legend', '', 'Mes critères indispensables'));
  const others = element('details', 'other-criteria');
  others.append(element('summary', '', 'Ajouter ou modifier des critères'));
  others.open = !value.keys.length;
  for (const [key, criterion] of Object.entries(criteria)) {
    const label = element('label', 'checkbox');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.value = key;
    checkbox.checked = value.keys.includes(key);
    checkbox.name = 'criterion';
    checkbox.setAttribute('form', 'searchForm');
    checkbox.addEventListener('change', () => {
      updateWidth();
      invalidate();
    });
    label.append(checkbox, document.createTextNode(criterion.label));
    (checkbox.checked ? $('criteria') : others).append(label);
  }
  $('criteria').append(others);
  $('minWidth').value = value.minWidth ?? '';
  updateWidth();
  $('questions').replaceChildren(...value.questions.map((question) => element('li', '', question)));
  $('search').disabled = false;
  $('searchHelp').textContent =
    'Les critères visibles seront utilisés par le classement déterministe, après votre confirmation.';
  $('reviewTitle').focus({ preventScroll: true });
  $('reviewTitle').scrollIntoView({ block: 'start' });
}
async function translate(local = false) {
  if (!$('descriptionForm').reportValidity()) return;
  if (!local && !$('consent').checked) {
    status(
      'proposalStatus',
      'Cochez votre accord pour OpenAI, ou choisissez les règles locales qui ne lui envoient rien.',
      true,
    );
    $('consent').focus();
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const active = controller;
  $('translate').disabled = true;
  $('local').disabled = true;
  status(
    'proposalStatus',
    local ? 'Traduction par les règles locales…' : 'Proposition de critères en cours…',
  );
  try {
    // Only this description goes to the model. Origin and directory records have a separate path.
    const value = local
      ? parseNeeds($('description').value)
      : await api(
          '/api/interpret',
          { description: $('description').value, consent: true },
          controller.signal,
        );
    if (controller !== active || active.signal.aborted) return;
    review({
      ...value,
      questions: value.questions || (value.clarification ? [value.clarification] : []),
    });
    status(
      'proposalStatus',
      local
        ? 'Proposition des règles locales. Relisez-la : elles peuvent manquer des nuances ou des négations.'
        : 'Voici la proposition IA. Elle ne recherche ni ne juge les cabinets. À vous de la corriger.',
    );
  } catch (error) {
    if (error.name !== 'AbortError') status('proposalStatus', error.message, true);
  } finally {
    $('translate').disabled = !aiAvailable;
    $('local').disabled = false;
  }
}
function selectedNeeds() {
  const keys = [...$('criteria').querySelectorAll('input:checked')].map((node) => node.value);
  return {
    keys,
    minWidth: keys.includes('width') && $('minWidth').value ? Number($('minWidth').value) : null,
  };
}
function factText(field, key) {
  if (!field || field.value === null || field.value === undefined) return 'Inconnu';
  return key === 'width' ? field.value + ' cm' : field.value ? 'Oui' : 'Non';
}
function stateLabel(field) {
  return (
    {
      declared: 'Déclaré',
      unknown: 'Inconnu',
      stale: 'Ancien · à confirmer',
      contradictory: 'Contradictoire · à confirmer',
      photo: 'Appuyé par une photo',
      patient: 'Confirmé par des patients',
    }[evidenceState(field)] || 'Inconnu'
  );
}
function card(practice) {
  const article = element('article', 'practice-card');
  const header = element('div', 'card-header');
  const identity = element('div');
  identity.append(element('h3', '', practice.name), element('p', 'specialty', practice.specialty));
  header.append(
    identity,
    element(
      'span',
      'status ' + (practice.needsConfirmation ? 'pending' : 'declared'),
      practice.needsConfirmation ? 'À confirmer' : 'Déclarations correspondantes',
    ),
  );
  article.append(header, element('p', 'address', practice.address));
  article.append(
    element(
      'p',
      'distance',
      practice.distanceKm === null
        ? 'Distance non calculée'
        : practice.distanceKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) +
            ' km à vol d’oiseau' +
            (origin?.approximate ? ' · depuis le centre du lieu choisi' : ''),
    ),
  );
  const facts = element('ul', 'facts');
  for (const check of practice.checks) {
    const label = criteria[check.key].label + ' : ' + factText({ value: check.value }, check.key);
    const trust = {
      declared: 'Déclaré',
      unknown: 'Inconnu',
      stale: 'Ancien',
      contradictory: 'Contradictoire',
      photo: 'Appuyé par une photo',
      patient: 'Confirmé par des patients',
    }[check.state];
    facts.append(
      element('li', '', label + ' · ' + trust + (check.fit === 'unknown' ? ' · À confirmer' : '')),
    );
  }
  article.append(facts);
  const details = element('details');
  details.append(element('summary', '', 'Tous les faits et leur provenance'));
  const allFacts = element('dl');
  for (const [key, field] of Object.entries(practice.evidence)) {
    allFacts.append(
      element('dt', '', criteria[key]?.label || key),
      element('dd', '', factText(field, key) + ' · ' + stateLabel(field)),
    );
  }
  details.append(
    allFacts,
    element(
      'p',
      '',
      'Source : ' +
        practice.source +
        '. Les dates de vérification individuelles ne sont pas disponibles dans cet export. Une déclaration n’est pas une garantie d’accès.',
    ),
  );
  const source = sourceLink('Voir la fiche Accès Libre', practice.sourceUrl, [
    'acceslibre.beta.gouv.fr',
  ]);
  if (source) details.append(source);
  details.append(
    element('h4', '', 'Informations administratives'),
    element(
      'p',
      '',
      'Inscription RPPS : non vérifiée. Secteur, tarifs et Carte Vitale : non renseignés dans cette source. Aucune note globale n’est calculée.',
    ),
  );
  article.append(details);
  const links = element('div', 'card-links');
  const booking = sourceLink('Ouvrir la fiche Doctolib', practice.doctolibUrl, [
    'doctolib.fr',
    'www.doctolib.fr',
  ]);
  if (booking) links.append(booking);
  else links.append(element('span', 'hint', 'Aucun lien Doctolib dans la source.'));
  const companion = element('a', '', 'Préparer l’échange ↗');
  companion.href = '/consultation?practice=' + encodeURIComponent(practice.id);
  companion.target = '_blank';
  companion.rel = 'noopener noreferrer';
  companion.setAttribute(
    'aria-label',
    'Préparer l’échange (nouvel onglet, votre recherche reste ouverte)',
  );
  links.append(companion);
  article.append(links);
  return article;
}
async function search(page = 1) {
  if (!$('searchForm').reportValidity() || !proposal) return;
  const needs = selectedNeeds();
  if (!needs.keys.length) {
    status('searchStatus', 'Sélectionnez au moins un critère avant de chercher.', true);
    $('searchStatus').focus();
    return;
  }
  status('searchStatus', '');
  const request =
    page === 1
      ? {
          confirmed: true,
          needs,
          specialty: $('specialty').value,
          origin,
          radiusKm: $('radius').value ? Number($('radius').value) : null,
        }
      : confirmedInput;
  if (!request) return;
  const resultsSection = $('resultsSection');
  if (resultsSection) resultsSection.hidden = false;
  controller?.abort();
  controller = new AbortController();
  confirmedInput = request;
  const active = controller;
  $('search').disabled = true;
  $('results').setAttribute('aria-busy', 'true');
  status('resultStatus', 'Comparaison des critères confirmés avec les données publiques…');
  try {
    const result = await api('/api/discover', { ...request, page }, controller.signal);
    if (controller !== active || active.signal.aborted) return;
    $('results').replaceChildren(...result.results.map(card));
    $('resultsSummary').textContent =
      result.counts.declaredMatches +
      ' fiche(s) dont les déclarations correspondent aux critères ; ' +
      (result.total - result.counts.declaredMatches) +
      ' à confirmer. L’accessibilité passe avant la distance.';
    status(
      'resultStatus',
      result.total
        ? 'Les données manquantes restent inconnues. Aucun score ni garantie d’accessibilité.'
        : 'Aucune fiche sans obstacle connu pour ces critères et cette zone. Essayez une autre spécialité ou une zone plus large.',
    );
    $('dataset').textContent =
      'Accès Libre · export du ' +
      date(result.dataset.exportedAt) +
      '. ' +
      result.counts.knownObstaclesExcluded +
      ' fiche(s) avec un obstacle connu écartée(s) de cette recherche ; toutes les fiches restent consultables dans l’annuaire. Distances calculées à partir des coordonnées importées, à vol d’oiseau.';
    $('pagination').replaceChildren();
    const addPage = (label, target) => {
      const button = element('button', 'secondary', label);
      button.type = 'button';
      button.onclick = () => search(target);
      $('pagination').append(button);
    };
    if (page > 1) addPage('← Précédent', page - 1);
    if (page * result.pageSize < result.total) addPage('Résultats suivants →', page + 1);
    $('resultsTitle').focus();
    if (resultsSection) $('resultsTitle').scrollIntoView({ block: 'start' });
  } catch (error) {
    if (error.name !== 'AbortError') {
      $('results').replaceChildren();
      status('resultStatus', error.message, true);
    }
  } finally {
    $('search').disabled = !proposal;
    $('results').setAttribute('aria-busy', 'false');
  }
}
$('descriptionForm').onsubmit = (event) => {
  event.preventDefault();
  translate(
    $('descriptionForm').dataset.localDefault === 'true' && event.submitter?.id !== 'translate',
  );
};
$('local').onclick = () => translate(true);
$('manual').onclick = () => {
  review({
    keys: [],
    minWidth: null,
    questions: [],
    parser: 'Critères choisis par vous · sans envoi à OpenAI',
  });
  status('proposalStatus', 'Choisissez vos critères, puis confirmez-les avant de chercher.');
};
$('searchForm').onsubmit = (event) => {
  event.preventDefault();
  search();
};
$('description').oninput = () => {
  proposal = null;
  $('review').hidden = true;
  if ($('advancedSearch')) $('searchForm').hidden = true;
  $('search').disabled = true;
  invalidate();
  status('proposalStatus', 'La description a changé. Demandez une nouvelle proposition.');
};
document.querySelectorAll('[data-example]').forEach((button) => {
  button.onclick = () => {
    $('description').value = button.dataset.example;
    $('description').dispatchEvent(new Event('input'));
    $('description').focus();
  };
});
$('minWidth').addEventListener('input', invalidate);
for (const id of ['specialty', 'radius']) $(id).addEventListener('change', invalidate);
$('findLocation').onclick = async () => {
  locationController?.abort();
  locationController = new AbortController();
  const active = locationController;
  $('findLocation').disabled = true;
  $('locationChoices').textContent = 'Recherche du lieu auprès d’IGN…';
  try {
    const result = await api('/api/locations', { query: $('location').value }, active.signal);
    if (locationController !== active || active.signal.aborted) return;
    $('locationChoices').replaceChildren();
    for (const location of result.locations) {
      const button = element(
        'button',
        'location-choice',
        location.label + (location.approximate ? ' · point approximatif' : ''),
      );
      button.type = 'button';
      button.onclick = () => {
        origin = location;
        $('origin').hidden = false;
        $('origin').textContent = 'Départ choisi : ' + location.label;
        $('removeOrigin').hidden = false;
        $('locationChoices').replaceChildren();
        invalidate();
      };
      $('locationChoices').append(button);
    }
    if (!result.locations.length)
      $('locationChoices').textContent =
        'Aucun lieu trouvé à Paris. Précisez l’adresse ou le quartier.';
  } catch (error) {
    if (error.name !== 'AbortError') $('locationChoices').textContent = error.message;
  } finally {
    $('findLocation').disabled = false;
  }
};
$('location').oninput = () => {
  locationController?.abort();
  origin = null;
  $('origin').hidden = true;
  $('removeOrigin').hidden = true;
  $('locationChoices').replaceChildren();
  invalidate();
};
$('removeOrigin').onclick = () => {
  origin = null;
  $('origin').hidden = true;
  $('removeOrigin').hidden = true;
  $('location').value = '';
  invalidate();
};
$('clear').onclick = () => {
  controller?.abort();
  locationController?.abort();
  origin = proposal = confirmedInput = null;
  $('descriptionForm').reset();
  $('searchForm').reset();
  $('review').hidden = true;
  if ($('advancedSearch')) $('searchForm').hidden = true;
  $('criteria')
    .querySelectorAll('label')
    .forEach((node) => node.remove());
  $('questions').replaceChildren();
  $('minWidth').value = '';
  updateWidth();
  $('proposalSource').textContent = '';
  $('locationChoices').replaceChildren();
  $('origin').textContent = '';
  $('origin').hidden = true;
  $('removeOrigin').hidden = true;
  $('search').disabled = true;
  invalidate();
  status('proposalStatus', 'Votre description et votre recherche ont été effacées.');
  const advanced = $('advancedSearch');
  if (advanced) advanced.open = false;
  $('description').focus();
};
(async () => {
  try {
    const [config, catalog] = await Promise.all([
      fetch('/api/ai-config').then((response) => response.json()),
      fetch('/api/catalog').then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      }),
    ]);
    aiAvailable = config.available === true;
    $('translate').disabled = !aiAvailable;
    $('consent').disabled = !aiAvailable;
    $('aiStatus').textContent = aiAvailable
      ? 'OpenAI propose les critères ; vous les confirmez. Le classement ne fait pas appel au modèle.'
      : 'Assistance IA indisponible. Les règles locales et la sélection manuelle restent utilisables.';
    for (const specialty of catalog.specialties) {
      const option = element('option', '', specialty);
      option.value = specialty;
      $('specialty').append(option);
    }
    $('dataset').textContent =
      catalog.count +
      ' fiches Accès Libre · export du ' +
      date(catalog.dataset.exportedAt) +
      '. Les déclarations et les inconnus restent visibles avec leur source.';
  } catch {
    $('aiStatus').textContent = 'Les données sont indisponibles. Réessayez plus tard.';
    $('translate').disabled = true;
  }
})();
