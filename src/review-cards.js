import { safeReviewUrl } from './review-core.mjs';
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
  item.setAttribute('aria-label', label + ' (nouvel onglet)');
  return item;
}
function render(content, data) {
  content.replaceChildren(
    node(
      'p',
      `${data.coverage.matchedSources} source(s) attribuable(s) · ${data.coverage.distinctSites} site(s). Consulté le ${new Date(data.checkedAt).toLocaleDateString('fr-FR')}. Collecte partielle.`,
      'hint',
    ),
  );
  if (data.summary) {
    const report = data.summary;
    content.append(
      node('p', report.label, 'review-sentiment'),
      node(
        'p',
        `${report.sampleSize} avis identifiable(s) · ${report.distinctSites} site(s). Échantillon limité, sans garantie de représentativité.`,
        'hint',
      ),
    );
    if (report.unidentifiedCount)
      content.append(
        node(
          'p',
          `${report.unidentifiedCount} extrait(s) sans référence individuelle écarté(s) du ressenti général.`,
          'hint',
        ),
      );
    const details = node('details');
    details.append(node('summary', 'Accueil, écoute, attente et organisation'));
    for (const topic of report.topics) {
      details.append(node('p', `${topic.label} : ${topic.assessment}`));
      if (topic.positive + topic.negative + topic.mixed)
        details.append(
          node(
            'p',
            `${topic.positive} favorable(s) · ${topic.negative} difficulté(s) · ${topic.mixed} partagé(s)`,
            'hint',
          ),
        );
      const examples = node('ul');
      for (const example of topic.examples) {
        const item = node('li', example.text + ' ');
        item.append(
          link('Source' + (example.publishedAt ? ' · ' + example.publishedAt : ''), example.url),
        );
        examples.append(item);
      }
      details.append(examples);
    }
    content.append(details);
  }
  if (!data.sources.length)
    content.append(
      node(
        'p',
        'Aucun avis attribuable trouvé dans les pages consultées. Réputation non renseignée.',
      ),
    );
  const sources = node('ul', '', 'review-sources');
  for (const source of data.sources) {
    const item = node('li');
    item.append(link(source.title || new URL(source.url).hostname, source.url));
    const scope = {
      matched: 'Établissement identifié',
      different_scope: 'Avis d’un praticien ou périmètre différent · non attribué au cabinet',
      ambiguous: 'Homonyme ou adresse ambiguë · non attribué',
      unconfirmed: 'Identité à confirmer · non attribué',
    }[source.match];
    item.append(node('p', scope, 'hint'));
    if (source.match === 'matched')
      item.append(
        node(
          'p',
          (source.rating === null
            ? 'Note non renseignée'
            : `${source.rating}/${source.ratingScale}`) +
            (source.reviewCount === null
              ? ' · volume non renseigné'
              : ` · ${source.reviewCount} avis sur ce site`) +
            (source.updatedAt
              ? ` · mis à jour le ${source.updatedAt}`
              : ' · date des données non renseignée'),
        ),
      );
    sources.append(item);
  }
  content.append(sources);
  const consulted = node('details');
  consulted.append(node('summary', 'Toutes les pages consultées'));
  const list = node('ul');
  for (const source of data.consulted) {
    const item = node('li');
    item.append(link(source.title, source.url));
    list.append(item);
  }
  consulted.append(
    list,
    ...(
      data.limitations || ['Les témoignages ne prouvent ni l’accessibilité ni la qualité clinique.']
    ).map((text) => node('p', text, 'hint')),
  );
  content.append(consulted);
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
        entry.button.textContent = 'Rechercher les avis avec OpenAI';
        entry.status.textContent = 'Recherche d’avis interrompue.';
      }
    onActivity(false);
  }
  for (const practice of practices) {
    const card = [...document.querySelectorAll('.practice-card')].find(
      (item) => item.dataset.practice === practice.id,
    );
    if (!card) continue;
    const section = node('section', '', 'review-info');
    section.setAttribute('aria-label', 'Avis publics · ' + practice.name);
    const heading = node('h4', 'Avis publics');
    const status = node('p', 'Réputation non renseignée.', 'hint');
    status.setAttribute('role', 'status');
    const content = node('div', '', 'review-content');
    const button = node(
      'button',
      available ? 'Rechercher les avis avec OpenAI' : 'Recherche d’avis indisponible',
      'text-button review-button',
    );
    button.type = 'button';
    button.disabled = !available;
    section.append(heading, status, content, button);
    card.append(section);
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
      onActivity(true, 'Je consulte les avis publics');
      try {
        const response = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ practiceId: practice.id, consent: true }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Avis indisponibles. Réessayez.');
        if (disposed || batch !== generation || !card.isConnected) return;
        cache.set(practice.id, result);
        if (cache.size > 50) cache.delete(cache.keys().next().value);
        render(content, result);
        onUpdate();
        status.textContent = '';
        button.hidden = true;
      } catch (error) {
        if (!disposed && batch === generation && error.name !== 'AbortError') {
          status.textContent = error.message;
          button.textContent = 'Réessayer les avis';
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
      status.textContent = 'Recherche d’avis demandée · identité publique uniquement.';
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
