import { criteria, evidenceState } from './core.mjs';
import { locale, lang, t } from './i18n.js';
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
    link.setAttribute('aria-label', t('results.newTab', { label }));
    return link;
  } catch {
    return null;
  }
}
function factText(field, key) {
  if (!field || field.value === null || field.value === undefined) return t('results.unknown');
  return key === 'width' ? field.value + ' cm' : t(field.value ? 'results.yes' : 'results.no');
}
function stateLabel(field) {
  const state = evidenceState(field);
  return t(`results.${['stale', 'contradictory'].includes(state) ? 'evidence' : 'trust'}.${state}`);
}
const specialtyKeys = {
  'Médecin généraliste': 'generalPractitioner',
  'Dentiste, chirurgien dentiste': 'dentist',
  Kinésithérapeute: 'physiotherapist',
};
export function practiceCard(practice, origin = null, notes = []) {
  const article = element('article', 'practice-card');
  article.dataset.practice = practice.id;
  article.setAttribute('aria-label', practice.name);
  const header = element('div', 'card-header');
  const identity = element('div');
  identity.append(
    element('h3', '', practice.name),
    element(
      'p',
      'specialty',
      (Object.hasOwn(specialtyKeys, practice.specialty)
        ? t(`results.specialties.${specialtyKeys[practice.specialty]}`)
        : practice.specialty) +
        ' · ' +
        t('results.practiceType'),
    ),
  );
  header.append(
    identity,
    element(
      'span',
      'status ' +
        (!practice.checks?.length
          ? 'none'
          : practice.needsConfirmation || notes.length
            ? 'pending'
            : 'declared'),
      !practice.checks?.length
        ? t('results.status.none')
        : practice.needsConfirmation || notes.length
          ? t('results.status.pending')
          : t('results.status.declared'),
    ),
  );
  const location = element('div', 'practice-location');
  location.append(element('p', 'address', practice.address));
  location.append(
    element(
      'p',
      'distance',
      practice.distanceKm === null || practice.distanceKm === undefined
        ? t('results.distanceUnknown')
        : t('results.distance', {
            distance: practice.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 }),
          }) + (origin?.approximate ? ' · ' + t('results.approximateOrigin') : ''),
    ),
  );
  article.append(header, location);
  const facts = element('ul', 'facts');
  const highlights = element('ul', 'facts fact-highlights');
  for (const check of practice.checks || []) {
    const label = t(`criteria.${check.key}`) + ' : ' + factText({ value: check.value }, check.key);
    const trust = t(`results.trust.${check.state}`);
    highlights.append(
      element(
        'li',
        check.fit,
        label +
          ' · ' +
          trust +
          (check.fit === 'unknown' ? ' · ' + t('results.status.pending') : ''),
      ),
    );
    facts.append(
      element(
        'li',
        check.fit,
        label +
          ' · ' +
          trust +
          (check.fit === 'unknown' ? ' · ' + t('results.status.pending') : '') +
          ' · ' +
          (check.source || 'Accès Libre') +
          (check.date
            ? ' · ' + new Date(check.date).toLocaleDateString(locale)
            : ' · ' + t('results.dateUnknown')),
      ),
    );
  }
  for (const question of notes) {
    const text = t('results.noteUnknown', { question });
    facts.append(element('li', 'unknown', text));
  }
  if (!practice.checks?.length && !notes.length)
    facts.append(element('li', 'unknown', t('results.emptyChecks')));
  article.append(highlights);
  const details = element('details');
  details.append(
    element('summary', '', notes.length ? t('results.detailsNeeds') : t('results.details')),
    element('p', 'hint', t('results.identityUnknown')),
    facts,
  );
  const allFacts = element('dl');
  for (const [key, field] of Object.entries(practice.evidence || {})) {
    allFacts.append(
      element('dt', '', criteria[key] ? t(`criteria.${key}`) : key),
      element('dd', '', factText(field, key) + ' · ' + stateLabel(field)),
    );
  }
  details.append(
    allFacts,
    element('p', '', t('results.source', { source: practice.source || 'Accès Libre' })),
    element('p', '', t('results.registration')),
  );
  article.append(details);
  const links = element('div', 'card-links');
  const source = sourceLink(t('results.links.accessible'), practice.sourceUrl, [
    'acceslibre.beta.gouv.fr',
  ]);
  if (source) {
    source.textContent = 'Accès Libre ↗';
    links.append(source);
  }
  const booking = sourceLink(t('results.links.doctolib'), practice.doctolibUrl, [
    'doctolib.fr',
    'www.doctolib.fr',
  ]);
  if (booking) {
    booking.textContent = 'Doctolib ↗';
    links.append(booking);
  } else {
    // Doctolib's own search ignores practice names, so look up the profile through Google.
    const search = new URL('https://www.google.com/search');
    search.searchParams.set(
      'q',
      [practice.name, practice.address?.match(/\b\d{5}\b.*$/)?.[0] || practice.address, 'doctolib']
        .filter(Boolean)
        .join(' '),
    );
    const lookup = sourceLink(t('results.links.lookup'), search.href, ['www.google.com']);
    lookup.setAttribute('aria-label', t('results.links.lookupLabel'));
    links.append(lookup);
    details.append(element('p', 'hint', t('results.links.lookupHelp')));
  }
  const companion = element('a', 'card-action', t('results.links.prepare'));
  companion.title = t('results.links.prepareTitle');
  companion.href = '/consultation?practice=' + encodeURIComponent(practice.id) + '&lang=' + lang;
  companion.target = '_blank';
  companion.rel = 'noopener noreferrer';
  companion.setAttribute('aria-label', t('results.links.prepareLabel'));
  links.append(companion);
  article.append(links);
  return article;
}
