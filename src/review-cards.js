import { safeReviewUrl } from './review-core.mjs';
import { locale, t } from './i18n.js';
const node = (tag, text = '', className = '') => {
  const item = document.createElement(tag);
  item.textContent = text;
  item.className = className;
  return item;
};
function link(label, url) {
  const safe = safeReviewUrl(url);
  if (!safe) return node('span', label);
  const item = node('a', label);
  item.href = safe;
  item.target = '_blank';
  item.rel = 'noopener noreferrer';
  item.setAttribute('aria-label', t('reviews.newTab', { label }));
  return item;
}
function render(content, data) {
  content.replaceChildren(
    node(
      'p',
      t('reviews.coverage', {
        sources: data.coverage.matchedSources,
        sites: data.coverage.distinctSites,
        date: new Date(data.checkedAt).toLocaleDateString(locale),
      }),
      'hint',
    ),
  );
  if (data.summary) {
    const report = data.summary;
    const tone =
      report.status !== 'available'
        ? 'none'
        : report.score > 0
          ? 'good'
          : report.score < 0
            ? 'bad'
            : 'mixed';
    content.prepend(
      node(
        'p',
        t(
          `reviews.sentiment.${tone === 'none' ? 'insufficient' : tone === 'good' ? 'positive' : tone === 'bad' ? 'negative' : 'mixed'}`,
        ),
        'review-sentiment ' + tone,
      ),
    );
    content.append(
      node(
        'p',
        t('reviews.sample', { count: report.sampleSize, sites: report.distinctSites }),
        'hint',
      ),
    );
    const details = node('details');
    details.append(node('summary', t('reviews.topicDetails')));
    for (const topic of report.topics) {
      details.append(
        node(
          'p',
          t(`reviews.topics.${topic.id}`) +
            ' : ' +
            t(
              `reviews.assessment.${topic.mixed || (topic.positive && topic.negative) ? 'mixed' : topic.positive ? 'positive' : topic.negative ? 'negative' : 'unknown'}`,
            ),
        ),
      );
      if (topic.positive + topic.negative + topic.mixed)
        details.append(
          node(
            'p',
            t('reviews.topicCounts', {
              positive: topic.positive,
              negative: topic.negative,
              mixed: topic.mixed,
            }),
            'hint',
          ),
        );
      const examples = node('ul');
      for (const example of topic.examples) {
        const item = node('li', example.text + ' ');
        item.append(
          link(
            t('reviews.source') + (example.publishedAt ? ' · ' + example.publishedAt : ''),
            example.url,
          ),
        );
        examples.append(item);
      }
      details.append(examples);
    }
    content.append(details);
  }
  if (!data.sources.length) content.append(node('p', t('reviews.empty')));
  const sources = node('ul', '', 'review-sources');
  for (const source of data.sources) {
    const item = node('li');
    item.append(link(source.title || new URL(source.url).hostname, source.url));
    const scope = t(`reviews.scope.${source.match}`);
    item.append(node('p', scope, 'hint'));
    if (source.match === 'matched')
      item.append(
        node(
          'p',
          (source.rating === null
            ? t('reviews.ratingUnknown')
            : `${source.rating}/${source.ratingScale}`) +
            (source.reviewCount === null
              ? ' · ' + t('reviews.countUnknown')
              : ' · ' + t('reviews.count', { count: source.reviewCount })) +
            (source.updatedAt
              ? ' · ' + t('reviews.updated', { date: source.updatedAt })
              : ' · ' + t('reviews.dateUnknown')),
        ),
      );
    sources.append(item);
  }
  content.append(sources);
  const consulted = node('details');
  consulted.append(node('summary', t('reviews.consulted')));
  const list = node('ul');
  for (const source of data.consulted) {
    const item = node('li');
    item.append(link(source.title, source.url));
    list.append(item);
  }
  consulted.append(
    list,
    ...(data.limitations || [t('reviews.disclaimer')]).map((text) => node('p', text, 'hint')),
  );
  content.append(consulted);
  // Only the sentiment stays visible; coverage and sources fold away to keep cards compact.
  if (!data.summary) content.prepend(node('p', t('reviews.unknown'), 'review-sentiment none'));
  const more = node('details', '', 'review-more');
  more.append(
    node('summary', t('reviews.details')),
    ...[...content.children].filter((child) => !child.classList.contains('review-sentiment')),
  );
  content.append(more);
}
export function mountReviewCards(
  practices,
  { available, automatic, cache, onActivity, onUpdate = () => {} },
) {
  let queue = Promise.resolve(),
    generation = 0,
    pending = 0,
    disposed = false;
  const controllers = new Set(),
    entries = [];
  function stop() {
    generation++;
    pending = 0;
    queue = Promise.resolve();
    for (const controller of controllers) controller.abort();
    controllers.clear();
    for (const entry of entries)
      if (entry.loading) {
        entry.loading = false;
        entry.button.disabled = !available;
        entry.button.textContent = t('reviews.actions.search');
        entry.status.textContent = t('reviews.status.stopped');
      }
    onActivity(false);
  }
  for (const practice of practices) {
    const card = [...document.querySelectorAll('.practice-card')].find(
      (item) => item.dataset.practice === practice.id,
    );
    if (!card) continue;
    const section = node('section', '', 'review-info');
    section.setAttribute('aria-label', t('reviews.headingLabel', { practice: practice.name }));
    const heading = node('h4', t('reviews.heading'));
    const status = node('p', t('reviews.unknown'), 'hint');
    status.setAttribute('role', 'status');
    const content = node('div', '', 'review-content');
    const button = node(
      'button',
      available ? t('reviews.actions.search') : t('reviews.actions.unavailable'),
      'text-button review-button',
    );
    button.type = 'button';
    button.disabled = !available;
    section.append(heading, status, content, button);
    // Reputation sits above details so it is visible without opening the card.
    card.querySelector('details').before(section);
    const entry = { button, status, loading: false };
    entries.push(entry);
    const cached = cache.get(practice.id);
    if (cached) {
      render(content, cached);
      status.textContent = '';
      button.hidden = true;
    }
    async function load(batch) {
      if (disposed || batch !== generation || !card.isConnected) return;
      const controller = new AbortController();
      controllers.add(controller);
      onActivity(true, t('reviews.status.working'));
      try {
        const response = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ practiceId: practice.id, consent: true }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(t('reviews.errors.unavailable'));
        if (disposed || batch !== generation || !card.isConnected) return;
        cache.set(practice.id, result);
        if (cache.size > 50) cache.delete(cache.keys().next().value);
        render(content, result);
        onUpdate();
        status.textContent = '';
        button.hidden = true;
      } catch (error) {
        if (!disposed && batch === generation && error.name !== 'AbortError') {
          status.textContent = t('reviews.errors.unavailable');
          button.textContent = t('reviews.actions.retry');
        }
      } finally {
        controllers.delete(controller);
        if (!disposed && batch === generation) {
          pending--;
          entry.loading = false;
          button.disabled = false;
          if (!pending) onActivity(false);
        }
      }
    }
    function schedule() {
      if (disposed || entry.loading || cache.has(practice.id)) return;
      const batch = generation;
      entry.loading = true;
      button.disabled = true;
      pending++;
      status.textContent = t('reviews.status.requested');
      queue = queue.then(() => load(batch));
    }
    button.onclick = schedule;
    if (automatic && available && entries.length <= 3 && !cached) schedule();
  }
  return {
    stop,
    dispose() {
      stop();
      disposed = true;
    },
  };
}
