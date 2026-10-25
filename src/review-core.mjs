export function safeReviewUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes('.') ||
      /^[\d.]+$/.test(url.hostname) ||
      !/^[a-z0-9.-]+$/.test(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)
    )
      return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(?:fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
}
export const reviewSite = (url) => new URL(url).hostname.split('.').slice(-2).join('.');

export const reviewTopics = {
  accueil: 'Accueil',
  ecoute: 'Écoute',
  attente: 'Attente',
  organisation: 'Organisation',
};
const normalizedText = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export function summarizeReviews(sources) {
  const records = new Map(),
    texts = new Map();
  let unidentifiedCount = 0;
  for (const source of sources) {
    const sourceUrl = safeReviewUrl(source.url);
    if (source.match !== 'matched' || !sourceUrl) continue;
    for (const observation of source.observations || []) {
      const origin = safeReviewUrl(observation.originalUrl) || sourceUrl;
      if (!observation.reviewId && !observation.originalUrl) {
        unidentifiedCount++;
        continue;
      }
      const identity = observation.reviewId
        ? reviewSite(origin) + ':' + observation.reviewId
        : origin;
      const textKey = normalizedText(observation.text);
      const identityMatch = records.get(identity),
        textMatch = texts.get(textKey);
      if (identityMatch && textMatch && identityMatch !== textMatch) {
        identityMatch.citations.push(...textMatch.citations);
        for (const [topic, opinions] of textMatch.themes) {
          if (!identityMatch.themes.has(topic)) identityMatch.themes.set(topic, new Set());
          for (const opinion of opinions) identityMatch.themes.get(topic).add(opinion);
        }
        for (const aliases of [records, texts])
          for (const [alias, target] of aliases)
            if (target === textMatch) aliases.set(alias, identityMatch);
      }
      const previous = identityMatch || textMatch;
      const record = previous || {
        text: observation.text,
        url: sourceUrl,
        publishedAt: observation.publishedAt,
        site: reviewSite(origin),
        themes: new Map(),
        citations: [],
      };
      records.set(identity, record);
      texts.set(textKey, record);
      record.citations.push({
        text: observation.text,
        url: sourceUrl,
        publishedAt: observation.publishedAt,
        themes: observation.themes || [],
      });
      for (const theme of observation.themes || []) {
        if (!Object.hasOwn(reviewTopics, theme.topic)) continue;
        if (!record.themes.has(theme.topic)) record.themes.set(theme.topic, new Set());
        record.themes.get(theme.topic).add(theme.sentiment);
      }
    }
  }
  const reviews = [...new Set(records.values())].filter((record) => record.themes.size);
  const distinctSites = new Set(reviews.map((record) => record.site)).size;
  const topics = Object.entries(reviewTopics).map(([id, label]) => {
    const topic = {
      id,
      label,
      positive: 0,
      negative: 0,
      mixed: 0,
      assessment: 'non renseigné',
      examples: [],
    };
    for (const record of reviews) {
      const opinions = record.themes.get(id);
      if (!opinions) continue;
      const sentiment =
        opinions.has('mixed') || (opinions.has('positive') && opinions.has('negative'))
          ? 'mixed'
          : opinions.has('positive')
            ? 'positive'
            : 'negative';
      topic[sentiment]++;
      for (const citation of record.citations) {
        const opinion = citation.themes.find((theme) => theme.topic === id);
        if (opinion && !topic.examples.some((example) => example.sentiment === opinion.sentiment))
          topic.examples.push({
            text: citation.text,
            url: citation.url,
            publishedAt: citation.publishedAt,
            sentiment: opinion.sentiment,
          });
      }
    }
    if (topic.mixed || (topic.positive && topic.negative)) topic.assessment = 'contrasté';
    else if (topic.positive) topic.assessment = 'retours favorables';
    else if (topic.negative) topic.assessment = 'difficultés rapportées';
    return topic;
  });
  const available = reviews.length >= 3;
  const score = available
    ? reviews.reduce((sum, record) => {
        const opinions = new Set([...record.themes.values()].flatMap((value) => [...value]));
        return (
          sum +
          (opinions.has('mixed') || (opinions.has('positive') && opinions.has('negative'))
            ? 0
            : opinions.has('positive')
              ? 1
              : -1)
        );
      }, 0) / reviews.length
    : null;
  return {
    status: available ? 'available' : 'insufficient',
    sampleSize: reviews.length,
    distinctSites,
    unidentifiedCount,
    topics,
    score,
    label: !available
      ? 'Avis insuffisants pour un ressenti général'
      : score > 0
        ? 'Retours consultés plutôt favorables'
        : score < 0
          ? 'Difficultés dans les retours consultés'
          : 'Retours consultés partagés',
  };
}
export function rankByReputation(practices, cache) {
  const ranked = [...practices],
    groups = new Map();
  for (let index = 0; index < ranked.length; index++) {
    const practice = ranked[index],
      summary = cache.get(practice.id)?.summary;
    if (summary?.status !== 'available' || !Number.isFinite(summary.score)) continue;
    const key = JSON.stringify([practice.needsConfirmation, practice.met, practice.distanceKm]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  }
  for (const positions of groups.values()) {
    const sorted = positions
      .map((index) => ranked[index])
      .sort((a, b) => cache.get(b.id).summary.score - cache.get(a.id).summary.score);
    positions.forEach((index, offset) => (ranked[index] = sorted[offset]));
  }
  return ranked;
}
