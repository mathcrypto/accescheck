import { criteria, evidenceState } from './core.mjs';
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
export function practiceCard(practice, origin = null, notes = []) {
  const article = element('article', 'practice-card');
  article.dataset.practice = practice.id;
  article.setAttribute('aria-label', practice.name);
  const header = element('div', 'card-header');
  const identity = element('div');
  identity.append(
    element('h3', '', practice.name),
    element('p', 'specialty', practice.specialty + ' · Cabinet ou établissement'),
  );
  header.append(
    identity,
    element(
      'span',
      'status ' + (practice.needsConfirmation ? 'pending' : 'declared'),
      !practice.checks?.length
        ? 'Accès non évalué'
        : practice.needsConfirmation || notes.length
          ? 'À confirmer'
          : 'Critères documentés',
    ),
  );
  const location = element('div', 'practice-location');
  location.append(element('p', 'address', practice.address));
  location.append(
    element(
      'p',
      'distance',
      practice.distanceKm === null || practice.distanceKm === undefined
        ? 'Distance non calculée'
        : practice.distanceKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) +
            ' km de votre adresse' +
            (origin?.approximate ? ' · depuis le centre du lieu choisi' : ''),
    ),
  );
  article.append(header, location);
  const facts = element('ul', 'facts');
  const highlights = element('ul', 'facts fact-highlights');
  for (const check of practice.checks || []) {
    const label = criteria[check.key].label + ' : ' + factText({ value: check.value }, check.key);
    const trust = {
      unknown: 'Inconnu',
      declared: 'Déclaré',
      stale: 'Ancien',
      contradictory: 'Contradictoire',
      photo: 'Appuyé par une photo',
      patient: 'Confirmé par des patients',
    }[check.state];
    highlights.append(
      element(
        'li',
        check.fit,
        label + ' · ' + trust + (check.fit === 'unknown' ? ' · À confirmer' : ''),
      ),
    );
    facts.append(
      element(
        'li',
        check.fit,
        label +
          ' · ' +
          trust +
          (check.fit === 'unknown' ? ' · À confirmer' : '') +
          ' · ' +
          (check.source || 'Accès Libre') +
          (check.date
            ? ' · ' + new Date(check.date).toLocaleDateString('fr-FR')
            : ' · date non renseignée'),
      ),
    );
  }
  for (const question of notes) {
    const text = question + ' : non documenté · à confirmer auprès du cabinet';
    facts.append(element('li', 'unknown', text));
    highlights.append(element('li', 'unknown', text));
  }
  if (!practice.checks?.length && !notes.length)
    facts.append(
      element(
        'li',
        'unknown',
        'Aucun besoin d’accès comparé. Consultez les informations déclarées avant votre visite.',
      ),
    );
  article.append(highlights);
  const details = element('details');
  details.append(
    element('summary', '', 'Détails et provenance'),
    element('p', 'hint', 'Identité individuelle non vérifiée.'),
    facts,
  );
  const allFacts = element('dl');
  for (const [key, field] of Object.entries(practice.evidence || {})) {
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
        (practice.source || 'Accès Libre') +
        '. Les dates absentes restent non renseignées. Une déclaration n’est pas une garantie d’accès.',
    ),
    element(
      'p',
      '',
      'Inscription RPPS : non vérifiée. Secteur, tarifs et Carte Vitale : non renseignés dans cette source. Aucune note globale n’est calculée.',
    ),
  );
  article.append(details);
  const links = element('div', 'card-links');
  const source = sourceLink('Fiche Accès Libre ↗', practice.sourceUrl, ['acceslibre.beta.gouv.fr']);
  if (source) {
    source.textContent = 'Accès Libre ↗';
    links.append(source);
  }
  const booking = sourceLink('Fiche Doctolib ↗', practice.doctolibUrl, [
    'doctolib.fr',
    'www.doctolib.fr',
  ]);
  if (booking) {
    booking.textContent = 'Doctolib ↗';
    links.append(booking);
  } else details.append(element('p', 'hint', 'Aucun lien Doctolib dans la source.'));
  const companion = element('a', 'card-action', 'Préparer ↗');
  companion.title = 'Préparer l’échange';
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
