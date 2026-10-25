const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const NEED_PHRASES = {
  fauteuil: 'Je me déplace en fauteuil électrique et j’ai besoin d’un passage de 90 cm.',
  audition: 'Je suis malentendant.',
  vision: 'Je me déplace avec une canne blanche.',
  lsf: 'Je communique en LSF.',
  'besoin-lieu':
    'Je me déplace avec une canne blanche. Je cherche un généraliste autour de Bastille à Paris.',
};

const STATE_LABEL = {
  declared: 'Déclaré',
  photo: 'Photo',
  patient: 'Patient',
  stale: 'Ancien',
  contradictory: 'Contradictoire',
};

const CRITERIA_LABELS = {
  stepFree: 'Entrée sans marche',
  route: 'Trajet jusqu’à l’accueil',
  width: 'Largeur de la porte d’entrée',
  hearing: 'Équipement pour malentendants',
  toilets: 'Sanitaires adaptés',
  signage: 'Signalétique intérieure',
  signLanguage: 'Personnel pratiquant la LSF',
  sensory: 'Aménagement sensoriel',
  communication: 'Communication écrite / visuelle',
};

let state = null;
let lastOriginLabel = '';

function setStatus(text, { error = false } = {}) {
  const el = $('status');
  el.textContent = text || '';
  el.classList.toggle('error', Boolean(error));
}

function appendUserBubble(text) {
  const thread = $('thread');
  const bubble = document.createElement('div');
  bubble.className = 'bubble user';
  bubble.innerHTML = `<p>${esc(text)}</p>`;
  thread.append(bubble);
  thread.scrollTop = thread.scrollHeight;
}

function criteriaLines(next) {
  if (!next?.needs?.keys?.length) return [];
  return next.needs.keys.map((key) => {
    if (key === 'width' && next.needs.minWidth !== null && next.needs.minWidth !== undefined)
      return `${CRITERIA_LABELS[key] || key} (passage ${next.needs.minWidth} cm)`;
    return CRITERIA_LABELS[key] || key;
  });
}

function appendAgentTurn({ reply, state: next, actions = [] }) {
  const thread = $('thread');
  const bubble = document.createElement('div');
  bubble.className = 'bubble agent';

  const body = document.createElement('div');
  body.className = 'agent-body';

  const criteria = criteriaLines(next);
  if (criteria.length || next?.specialty || next?.origin?.label || next?.placeQuery) {
    const block = document.createElement('dl');
    block.className = 'understood';
    if (criteria.length) {
      block.innerHTML += `<dt>Critères</dt><dd>${esc(criteria.join(', '))}</dd>`;
    }
    if (next.specialty) {
      block.innerHTML += `<dt>Profession</dt><dd>${esc(next.specialty)}</dd>`;
    }
    if (next.origin?.label || next.placeQuery) {
      const typed = String(next.placeQuery || '').trim();
      const origin = String(next.origin?.label || '').trim();
      // Prefer what the patient typed (denfert paris 14e) over a bare IGN arrondissement.
      let place = typed || origin;
      place = place
        .replace(/\bparis\b/gi, 'Paris')
        .replace(/\bdenfert\b/gi, 'Denfert')
        .replace(/\bbastille\b/gi, 'Bastille')
        .replace(/\brepublique\b/gi, 'République');
      const radius =
        next.origin && next.radiusKm
          ? ` · rayon ${next.radiusKm} km à vol d’oiseau`
          : typed && !next.origin
            ? ' (lieu à préciser)'
            : '';
      block.innerHTML += `<dt>Autour de</dt><dd>${esc(place)}${esc(radius)}</dd>`;
    }
    body.append(block);
  }

  if (reply) {
    const p = document.createElement('p');
    p.className = 'agent-reply';
    p.textContent = reply;
    body.append(p);
  }

  bubble.append(body);

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'agent-actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.id === 'confirm' || action.id === 'search' ? 'primary' : 'ghost';
      button.textContent = action.label;
      button.onclick = () => ask({ action: action.id });
      row.append(button);
    }
    bubble.append(row);
  }

  thread.append(bubble);
  thread.scrollTop = thread.scrollHeight;
}

function resetConversation() {
  state = null;
  lastOriginLabel = '';
  setStatus('');
  $('message').value = '';
  $('thread').replaceChildren();
  $('results').innerHTML =
    '<p class="empty">Les cabinets correspondants apparaîtront ici après la recherche.</p>';
}

function evidenceLabel(check) {
  if (check.fit === 'unmet') return 'obstacle';
  if (check.fit === 'unknown') return 'à confirmer';
  if (check.key === 'width' && Number.isFinite(check.value)) return `${check.value} cm`;
  if (check.fit === 'met') return 'oui';
  return 'à confirmer';
}

function provenance(check) {
  const bits = [evidenceLabel(check)];
  if (check.state && check.state !== 'unknown') bits.push(STATE_LABEL[check.state] || check.state);
  let sourceBit = String(check.source || 'Accès Libre');
  if (/acc[eè]s\s*libre/i.test(sourceBit)) sourceBit = 'Accès Libre';
  if (check.date) {
    const year = new Date(check.date).getFullYear();
    if (Number.isFinite(year)) sourceBit += `, mis à jour ${year}`;
  }
  bits.push(sourceBit);
  return `${check.label} · ${bits.join(' · ')}`;
}

function distanceLabel(km, originLabel) {
  if (!Number.isFinite(km)) return '';
  const dist = km.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  if (!originLabel) return `${dist} km à vol d’oiseau`;
  const place = originLabel.replace(/^centre (de |d’|d')/i, '').trim();
  return `${dist} km à vol d’oiseau du centre de ${place}`;
}

function renderResults(payload) {
  const root = $('results');
  root.replaceChildren();
  if (!payload) {
    root.innerHTML =
      '<p class="empty">Les cabinets correspondants apparaîtront ici après la recherche.</p>';
    return;
  }
  if (!payload.practices?.length) {
    root.innerHTML =
      '<p class="empty">Aucun cabinet à afficher pour cette recherche. Élargissez le rayon ou retirez un critère.</p>';
    return;
  }

  lastOriginLabel = payload.originLabel || lastOriginLabel || '';
  const head = document.createElement('div');
  head.className = 'results-head';
  const needed = payload.needed || 0;
  const quality = payload.completeCount
    ? `${payload.completeCount} correspondance${payload.completeCount > 1 ? 's' : ''} complète${payload.completeCount > 1 ? 's' : ''}`
    : payload.bestMet > 0 && needed
      ? `meilleures fiches ${payload.bestMet}/${needed}`
      : 'à confirmer chez le cabinet';
  const excluded = payload.counts?.knownObstaclesExcluded;
  const excludedHint =
    Number.isFinite(excluded) && excluded > 0
      ? `${excluded} exclus (obstacle connu)`
      : 'obstacles connus exclus';
  head.innerHTML = `<p class="summary-line">${esc(payload.total)} résultat${payload.total > 1 ? 's' : ''} · ${esc(quality)} · ${esc(excludedHint)}</p>
    <p class="hint reputation-note">${
      payload.doctolibSearchUrl
        ? `<a href="${esc(payload.doctolibSearchUrl)}" target="_blank" rel="noopener noreferrer">Chercher aussi sur Doctolib</a> <span class="muted">(annuaire externe, hors Accès Libre)</span>`
        : `<a href="https://www.doctolib.fr/" target="_blank" rel="noopener noreferrer">Chercher aussi sur Doctolib</a>`
    }</p>`;
  root.append(head);

  for (const practice of payload.practices) {
    const card = document.createElement('article');
    const strong = practice.complete || (practice.met > 0 && practice.met >= needed - 1);
    card.className = 'card' + (practice.complete ? ' complete' : strong ? ' strong' : '');
    const distance = Number.isFinite(practice.distanceKm)
      ? `<span class="distance">${esc(distanceLabel(practice.distanceKm, lastOriginLabel))}</span>`
      : '';
    const badge = practice.complete
      ? '<p class="badge">Tous les critères demandés sont renseignés</p>'
      : practice.met && needed
        ? `<p class="badge partial">${esc(practice.met)}/${esc(needed)} critères</p>`
        : '';

    const links = [];
    if (practice.sourceUrl) {
      links.push(
        `<a class="book" href="${esc(practice.sourceUrl)}" target="_blank" rel="noopener noreferrer">Accès Libre</a>`,
      );
    }
    // Only a real Doctolib profile from Accès Libre — never a fake /search that drops the doctor.
    if (practice.doctolibUrl) {
      links.push(
        `<a class="book doctolib" href="${esc(practice.doctolibUrl)}" target="_blank" rel="noopener noreferrer">Doctolib</a>`,
      );
    }
    if (practice.websiteUrl && !practice.doctolibUrl) {
      links.push(
        `<a href="${esc(practice.websiteUrl)}" target="_blank" rel="noopener noreferrer">Site / contact</a>`,
      );
    }
    links.push(
      `<a href="/consultation?practice=${encodeURIComponent(practice.id)}" target="_blank" rel="noopener noreferrer" aria-label="Préparer la visite (nouvel onglet, votre recherche reste ouverte)">Préparer la visite ↗</a>`,
    );

    card.innerHTML = `<div class="card-top">
        <div>
          <h2>${esc(practice.name)}</h2>
          <p class="meta">${esc(practice.specialty)} · ${esc(practice.address)}</p>
          ${badge}
        </div>
        ${distance}
      </div>
      <ul class="checks">${(practice.checks || [])
        .map((check) => `<li class="${esc(check.fit)}">${esc(provenance(check))}</li>`)
        .join('')}</ul>
      <div class="actions">${links.join('')}</div>`;
    root.append(card);
  }
}

async function ask({ message, action } = {}) {
  setStatus('Recherche en cours…');
  $('send').disabled = true;
  if (action === 'clear') {
    resetConversation();
    $('send').disabled = false;
    return;
  }
  if (message) appendUserBubble(message);
  try {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || '',
        action: action || '',
        consent: false,
        state,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Recherche indisponible.');
    state = data.state || null;
    appendAgentTurn({
      reply: data.reply,
      state,
      actions: data.actions || [],
    });
    if (data.results?.originLabel) lastOriginLabel = data.results.originLabel;
    else if (state?.origin?.label) lastOriginLabel = state.origin.label;
    renderResults(data.results);
    setStatus('');
  } catch (error) {
    setStatus(error.message, { error: true });
    appendAgentTurn({ reply: error.message, state, actions: [] });
  } finally {
    $('send').disabled = false;
  }
}

$('form').onsubmit = (event) => {
  event.preventDefault();
  const message = $('message').value.trim();
  if (!message) {
    setStatus('Écrivez un besoin, une profession ou une ville.', { error: true });
    return;
  }
  $('message').value = '';
  ask({ message });
};

$('clear').onclick = () => ask({ action: 'clear' });

for (const button of document.querySelectorAll('.example')) {
  button.onclick = () => {
    const phrase = NEED_PHRASES[button.dataset.need];
    if (!phrase) return;
    $('message').value = phrase;
    $('message').focus();
  };
}

(async () => {
  const seed = (location.hash.match(/^#besoin=([a-z-]+)$/) || [])[1];
  if (seed && NEED_PHRASES[seed]) {
    history.replaceState(null, '', location.pathname);
    await ask({ message: NEED_PHRASES[seed] });
  }
})();
