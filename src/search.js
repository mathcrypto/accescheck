const $ = (id) => document.getElementById(id);
let response = null,
  page = 0,
  lastInput = null,
  activeController = null;
const size = 6;
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const safeLink = (s, hosts) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && hosts.includes(u.hostname) && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
};
const states = {
  declared: 'Déclaré · date de confirmation inconnue',
  unknown: 'Non renseigné',
  stale: 'Information ancienne',
  contradictory: 'Sources contradictoires',
  photo: 'Appuyé par une photo',
  patient: 'Confirmé par un patient',
};
const labels = {
  stepFree: 'Entrée sans marche',
  route: 'Trajet jusqu’à l’accueil',
  width: 'Largeur de la porte d’entrée',
  hearing: 'Équipement auditif',
  toilets: 'Sanitaires adaptés',
  consultation: 'Salle de consultation',
  signage: 'Signalétique intérieure',
};
function input() {
  return {
    needs: $('needs').value,
    district: $('district').value,
    specialty: $('specialty').value,
    ...($('width').value ? { width: Number($('width').value) } : {}),
  };
}
async function api(path, body, signal) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Service indisponible.');
  return data;
}
async function search() {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  lastInput = input();
  $('results').setAttribute('aria-busy', 'true');
  $('searchButton').disabled = true;
  $('searchButton').textContent = 'Recherche…';
  try {
    response = await api('/api/search', lastInput, controller.signal);
    page = 0;
    render();
  } catch (e) {
    if (e.name !== 'AbortError') {
      $('results').innerHTML =
        '<div class="empty error">' +
        esc(e.message) +
        ' Réessayez avec le bouton de recherche.</div>';
      $('pager').innerHTML = '';
      $('resultTitle').textContent = 'Recherche indisponible';
      $('clarification').textContent = '';
      $('summary').innerHTML = '';
      response = null;
    }
  } finally {
    if (activeController === controller) {
      $('results').setAttribute('aria-busy', 'false');
      $('searchButton').disabled = false;
      $('searchButton').innerHTML = 'Trouver un cabinet &nbsp; ↗';
    }
  }
}
function render() {
  const data = response.results;
  const start = page * size;
  $('resultTitle').textContent =
    data.length + ' cabinet' + (data.length > 1 ? 's' : '') + ' à explorer';
  $('resultSubtitle').textContent = 'Informations en cache · classement par critères documentés';
  $('clarification').textContent = response.needs.clarification || '';
  $('summary').innerHTML = response.needs.keys
    .map((k) => '<span>' + esc(labels[k]) + '</span>')
    .join('');
  $('results').innerHTML = data.length
    ? data
        .slice(start, start + size)
        .map((p) => {
          const booking = safeLink(p.doctolibUrl, ['www.doctolib.fr', 'doctolib.fr']);
          const initials = p.name
            .split(/\s+/)
            .slice(0, 2)
            .map((x) => x[0])
            .join('');
          return (
            '<article class="card"><div class="card-top"><div class="practice"><div class="avatar" aria-hidden="true">' +
            esc(initials) +
            '</div><div><h3>' +
            esc(p.name) +
            '</h3><p class="specialty">' +
            esc(p.specialty) +
            '</p></div></div><span class="status ' +
            p.category +
            '">' +
            (p.category === 'obstacle'
              ? 'Obstacle connu'
              : p.category === 'supported'
                ? 'Critères renseignés'
                : p.category === 'unassessed'
                  ? 'Besoins à préciser'
                  : 'À confirmer') +
            '</span></div><p class="address">' +
            esc(p.address) +
            '</p><div class="evidence">' +
            p.checks
              .map(
                (c) =>
                  '<span class="check ' +
                  c.fit +
                  '">' +
                  (c.fit === 'met'
                    ? 'Correspond : '
                    : c.fit === 'unmet'
                      ? 'Ne correspond pas : '
                      : 'À confirmer : ') +
                  esc(labels[c.key]) +
                  (c.key === 'width' && c.value !== null ? ' · ' + esc(c.value) + ' cm' : '') +
                  '</span>',
              )
              .join('') +
            '</div><div class="card-bottom"><small>' +
            esc(p.source) +
            (p.mode === 'real'
              ? ' · ' + p.met + ' critère(s) correspondant(s) / ' + p.checks.length
              : ' · Ne pas utiliser pour une visite réelle') +
            '</small><div class="card-actions">' +
            (booking
              ? '<a class="primary" href="' +
                esc(booking) +
                '" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Doctolib pour ' +
                esc(p.name) +
                ' (nouvel onglet)">Prendre rendez-vous</a>'
              : '<span class="nobook">Pas de lien Doctolib</span>') +
            '<a class="linkbutton" href="/consultation?practice=' +
            encodeURIComponent(p.id) +
            '">Suivre l’échange</a><button class="text-btn detail" data-id="' +
            esc(p.id) +
            '">Voir les preuves ↗</button></div></div></article>'
          );
        })
        .join('')
    : '<div class="empty">Aucun établissement dans cet échantillon pour ces filtres. Essayez tout Paris ou une autre spécialité.</div>';
  $('pager').innerHTML =
    data.length > size
      ? '<button id="prev" ' +
        (page === 0 ? 'disabled' : '') +
        '>← Précédent</button><span>' +
        (start + 1) +
        '–' +
        Math.min(start + size, data.length) +
        ' sur ' +
        data.length +
        '</span><button id="next" ' +
        (start + size >= data.length ? 'disabled' : '') +
        '>Suivant →</button>'
      : '';
  if ($('prev'))
    $('prev').onclick = () => {
      page--;
      render();
      $('resultTitle').scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
  if ($('next'))
    $('next').onclick = () => {
      page++;
      render();
      $('resultTitle').scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
}
function modal(content) {
  $('dialogContent').innerHTML = content;
  $('dialog').showModal();
}
async function detail(id) {
  const p = response?.results.find((p) => p.id === id);
  if (!p) return;
  const source = safeLink(p.sourceUrl, ['acceslibre.beta.gouv.fr']);
  const booking = safeLink(p.doctolibUrl, ['www.doctolib.fr', 'doctolib.fr']);
  modal(
    '<div class="eyebrow">VOTRE FICHE D’ACCESSIBILITÉ</div><h2 id="dialogTitle">' +
      esc(p.name) +
      '</h2><p class="muted">' +
      esc(p.address) +
      '</p><p>' +
      esc(
        'Informations déclaratives Accès Libre. La date de confirmation individuelle n’est pas fournie dans cet export.',
      ) +
      '</p><table class="evidence-table"><thead><tr><th>Critère demandé</th><th>Information</th><th>Confiance</th></tr></thead><tbody>' +
      p.checks
        .map(
          (c) =>
            '<tr><td>' +
            esc(labels[c.key]) +
            '</td><td>' +
            esc(
              c.value === null
                ? 'Inconnu'
                : typeof c.value === 'boolean'
                  ? c.value
                    ? 'Oui'
                    : 'Non'
                  : c.value + ' cm',
            ) +
            '</td><td>' +
            esc(states[c.state]) +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table><p class="muted">Une porte assez large ou une entrée sans marche ne garantit pas l’accès à l’ensemble du cabinet. Le matériel et l’aide au transfert restent à confirmer.</p>' +
      (source
        ? '<p><a target="_blank" rel="noopener noreferrer" href="' +
          esc(source) +
          '">Consulter la fiche Accès Libre ↗</a> · Export du 24/10/2026</p>'
        : '') +
      '' +
      (booking
        ? '<p><a class="primary" href="' +
          esc(booking) +
          '" target="_blank" rel="noopener noreferrer">Prendre rendez-vous sur Doctolib</a></p>'
        : '<p class="nobook">Aucun lien Doctolib n’est indiqué pour ce cabinet.</p>') +
      '<div class="card-actions"><button class="primary" id="makeBrief">Préparer ma visite ↗</button><a class="linkbutton" href="/consultation?practice=' +
      encodeURIComponent(p.id) +
      '" aria-label="Compagnon de ce rendez-vous">Suivre l’échange</a></div><div id="brief"></div>',
  );
  $('makeBrief').onclick = async () => {
    const b = $('makeBrief');
    b.disabled = true;
    try {
      const r = await api('/api/briefing', { ...lastInput, id });
      $('brief').innerHTML =
        '<div class="callbox"><h3>Votre script pour appeler le cabinet</h3><p>' +
        esc(r.script) +
        '</p><ul>' +
        r.questions.map((q) => '<li>' + esc(q) + '</li>').join('') +
        '<li>Mon matériel et mes besoins de transfert permettent-ils la consultation dans votre cabinet ?</li></ul><p>Les modalités de stationnement et le trajet depuis la rue restent à confirmer.</p></div><button class="text-btn" id="copyBrief">Copier ma préparation</button><span id="copyStatus" role="status"></span>';
      $('copyBrief').onclick = async () => {
        try {
          await navigator.clipboard.writeText(
            r.name +
              '\n' +
              r.address +
              '\n\n' +
              r.script +
              '\n' +
              [
                ...r.questions,
                'Mon matériel et mes besoins de transfert permettent-ils la consultation ?',
                'Quelles sont les modalités de stationnement et d’accès depuis la rue ?',
              ]
                .map((q) => '• ' + q)
                .join('\n'),
          );
          $('copyStatus').textContent = ' Copié.';
        } catch {
          $('copyStatus').textContent = ' Copie indisponible. Sélectionnez le texte ci-dessus.';
        }
      };
    } catch (e) {
      $('brief').textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
}
function trust() {
  modal(
    '<div class="eyebrow">LA TRANSPARENCE D’ABORD</div><h2 id="dialogTitle">Ce que les données nous disent.</h2><p>Nous utilisons un extrait de l’export public Accès Libre du 24 octobre 2026 : 510 établissements médicaux à Paris. La source est collaborative et ses informations ne constituent pas une garantie d’accès.</p><h3>Une date d’export n’est pas une date de vérification</h3><p>Le fichier ne fournit pas les dates de confirmation individuelles ni les identités des contributeurs. Les critères renseignés sont donc marqués « déclarés ». Aucun n’est présenté comme vérifié par une photo ou confirmé par un patient.</p><h3>Comment fonctionne le classement ?</h3><p>Les critères correspondant à vos besoins et renseignés positivement passent en premier. Les obstacles connus passent en dernier. Les informations manquantes ou contradictoires restent à confirmer. Nous ne calculons ni distance, ni temps de trajet, ni disponibilité de rendez-vous.</p><h3>Vos besoins restent temporaires</h3><p>Le texte est traité par des règles explicites sur notre serveur, sans modèle IA, sans compte et sans enregistrement dans une base de données. Il est envoyé dans le corps de la requête, jamais dans l’adresse de la page. Vous pouvez l’effacer à tout moment.</p><p>Le compagnon de rendez-vous propose des sous-titres selon le navigateur, des messages parlés et des notes à relire. La vérification par photos et les retours de patients restent à développer.</p><p><a href="https://www.data.gouv.fr/datasets/acceslibre/" target="_blank" rel="noopener noreferrer">Source : Accès Libre — Ministère de la Transition écologique ↗</a><br>Licence Ouverte / Etalab 2.0. Données importées le 25/10/2026.</p>',
  );
}
$('searchForm').onsubmit = (e) => {
  e.preventDefault();
  search();
};
document.querySelectorAll('[data-example]').forEach(
  (b) =>
    (b.onclick = () => {
      $('needs').value = b.dataset.example;
      $('needs').focus();
    }),
);
$('reset').onclick = () => {
  activeController?.abort();
  $('needs').value = '';
  $('width').value = '';
  lastInput = null;
  response = null;
  $('results').innerHTML =
    '<div class="empty">Vos besoins ont été effacés. Décrivez un nouveau besoin pour commencer.</div>';
  $('pager').innerHTML = '';
  $('summary').innerHTML = '';
  $('clarification').textContent = '';
  $('resultTitle').textContent = 'Une nouvelle recherche';
  $('resultSubtitle').textContent = 'Aucun besoin conservé';
  $('dialogContent').innerHTML = '';
  $('dialog').close();
  $('needs').focus();
};
$('results').onclick = (e) => {
  const b = e.target.closest('.detail');
  if (b) detail(b.dataset.id);
};
$('closeDialog').onclick = () => $('dialog').close();
$('dialog').addEventListener('click', (e) => {
  if (e.target === $('dialog')) {
    const r = $('dialog').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      $('dialog').close();
  }
});
$('navConsultation').onclick = () => location.assign('/consultation');
$('learnTrust').onclick = trust;
$('navSearch').onclick = () => {
  $('recherche').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('needs').focus();
};
$('easy').onclick = () => {
  const on = document.body.classList.toggle('easy');
  $('easy').setAttribute('aria-pressed', String(on));
  $('easy').textContent = on ? 'Revenir à la taille standard Aa' : 'Activer la lecture agrandie Aa';
};
(async () => {
  try {
    const r = await fetch('/api/catalog');
    if (!r.ok) throw new Error();
    const d = await r.json();
    for (const zip of d.districts) {
      const o = document.createElement('option');
      o.value = zip;
      o.textContent =
        'Paris ' + Number(zip.slice(3)) + (zip.endsWith('01') ? 'er' : 'e') + ' · ' + zip;
      $('district').append(o);
    }
    for (const s of d.specialties) {
      const o = document.createElement('option');
      o.value = s;
      o.textContent = s;
      $('specialty').append(o);
    }
    $('datasetCount').textContent =
      d.count +
      ' établissements médicaux à Paris. Source : Accès Libre. Export du 24/10/2026 ; dates individuelles non disponibles.';
    await search();
  } catch {
    $('results').innerHTML =
      '<div class="empty error">Les données sont indisponibles. Rechargez la page pour réessayer.</div>';
  }
})();

{
  const k = (location.hash.match(/^#besoin=([a-z-]+)$/) || [])[1];
  const t = {
    fauteuil: 'Je me déplace en fauteuil roulant.',
    audition: 'Je suis malentendant.',
    vision: 'Je suis malvoyant.',
    'sans-marche': 'J’ai besoin d’une entrée sans marche et de sanitaires adaptés.',
  }[k];
  if (t) {
    $('needs').value = t;
    history.replaceState(null, '', location.pathname);
    $('needs').focus();
  }
}
