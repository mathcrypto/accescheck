export const criteria = {
  stepFree: {
    label: 'Entrée sans marche',
    question: 'L’entrée est-elle de plain-pied, sans marche ni seuil ?',
  },
  route: {
    label: 'Trajet jusqu’à l’accueil',
    question:
      'Le trajet jusqu’à l’accueil est-il sans marche ? Et jusqu’à la salle de consultation ?',
  },
  width: {
    label: 'Largeur de la porte d’entrée',
    question: 'Quelle est la largeur utile minimale des portes et passages ?',
  },
  hearing: {
    label: 'Équipement auditif',
    question: 'Disposez-vous d’une boucle à induction ou d’un autre équipement auditif ?',
  },
  toilets: {
    label: 'Sanitaires adaptés',
    question: 'Les sanitaires sont-ils adaptés et disponibles pendant la visite ?',
  },
  consultation: {
    label: 'Salle de consultation accessible',
    question:
      'La salle et les équipements de consultation conviennent-ils à mes besoins, notamment pour le transfert ?',
  },
  signage: {
    label: 'Signalétique intérieure',
    question: 'Une signalétique lisible et compréhensible permet-elle de s’orienter ?',
  },
  signLanguage: {
    label: 'Communication en LSF',
    question:
      'Une personne peut-elle communiquer en langue des signes française pendant la consultation ?',
  },
  sensory: {
    label: 'Aménagements sensoriels',
    question: 'Quels aménagements sont possibles pour le bruit, la lumière et l’attente ?',
  },
  communication: {
    label: 'Communication adaptée',
    question: 'Puis-je communiquer par écrit ou avec mon outil de communication, à mon rythme ?',
  },
};
export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Paramètres invalides.');
  if (typeof input.needs !== 'string' || input.needs.length > 2000)
    throw new Error('Décrivez vos besoins en 2 000 caractères maximum.');
  for (const key of ['specialty', 'district', 'mode'])
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 100))
      throw new Error('Filtre invalide.');
  if (input.mode !== undefined && input.mode !== 'real') {
    throw new Error('Seuls les cabinets importés depuis Accès Libre sont disponibles.');
  }
  if (
    input.width !== undefined &&
    (!Number.isFinite(input.width) || input.width < 40 || input.width > 200)
  )
    throw new Error('Largeur attendue : 40 à 200 cm.');
  return input;
}
function denied(text, pattern) {
  const matches = [...text.matchAll(new RegExp(pattern.source, 'g'))];
  // shortcut: direct denials only; complex negation still needs the user's review.
  const denial =
    /\b(?:pas|plus|jamais|aucune?|not|no)\s+(?:(?:en|de|un|une|le|la|besoin|in|using|a|an)\s+|d['’])*$/;
  return matches.length > 0 && matches.every((match) => denial.test(text.slice(0, match.index)));
}
export function parseNeeds(text, width) {
  const t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const keys = new Set();
  const wheelchair =
    !denied(t, /fauteuil|wheelchair|mobilite reduite|deambulateur|paraplegi/) &&
    /fauteuil|wheelchair|mobilite reduite|deambulateur|paraplegi/.test(t);
  const stepFree =
    wheelchair ||
    (!denied(t, /sans marche|plain.?pied|step.?free|bequille/) &&
      /sans marche|plain.?pied|step.?free|bequille/.test(t));
  if (stepFree) {
    keys.add('stepFree');
    keys.add('route');
  }
  if (wheelchair) keys.add('width');
  if (
    !denied(t, /malentendant|sourd|auditi|hard of hearing|hearing|boucle/) &&
    /malentendant|sourd|auditi|hard of hearing|hearing|boucle/.test(t)
  )
    keys.add('hearing');
  if (!denied(t, /toilet|sanitaire/) && /toilet|sanitaire/.test(t)) keys.add('toilets');
  if (
    !denied(t, /malvoyant|aveugle|signaleti|visuel|blind|canne blanche/) &&
    /malvoyant|aveugle|signaleti|visuel|blind|canne blanche/.test(t)
  )
    keys.add('signage');
  if (!denied(t, /lsf|langue des signes/) && /lsf|langue des signes/.test(t))
    keys.add('signLanguage');
  if (
    !denied(t, /calme|lumiere|sensoriel|bruit/) &&
    /espace calme|lumiere reduite|amenagements? sensoriels?|sensible au bruit/.test(t)
  )
    keys.add('sensory');
  if (
    /communiqu\w* par ecrit|outil de communication/.test(t) ||
    (/\bne peux pas parler\b/.test(t) && /communiqu|ecrit/.test(t))
  )
    keys.add('communication');
  const meter = t.match(/\b(\d+(?:[.,]\d+)?)\s*m\b/);
  const match = t.match(/\b(\d{2,3})\s*cm\b/);
  const fromMeter = meter ? Math.round(Number(meter[1].replace(',', '.')) * 100) : null;
  const requested = width ?? (match ? Number(match[1]) : fromMeter);
  if (requested !== null && (requested < 40 || requested > 200))
    throw new Error('Largeur attendue : 40 à 200 cm.');
  if (requested !== null) keys.add('width');
  return {
    keys: [...keys],
    minWidth: requested,
    clarification:
      keys.size === 0
        ? 'Précisez un besoin concret (déplacement, audition, vision, communication…).'
        : keys.has('width') && requested === null
          ? 'Quelle largeur de passage vous faut-il ? Renseignez-la pour comparer les portes ; aucun seuil n’est supposé.'
          : null,
    parser: 'Règles locales explicites, sans modèle IA',
  };
}
export function evidenceState(field, now = new Date()) {
  if (!field || field.value === null || field.value === undefined) return 'unknown';
  if (field.status === 'contradictory') return 'contradictory';
  if (field.date && Number.isFinite(Date.parse(field.date))) {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
    if (new Date(field.date) < cutoff) return 'stale';
  }
  return ['photo', 'patient', 'declared'].includes(field.status) ? field.status : 'declared';
}
function criterionFit(key, value, state, minWidth) {
  if (['unknown', 'contradictory', 'stale'].includes(state)) {
    return 'unknown';
  }
  if (key === 'width') {
    if (minWidth === null) return 'unknown';
    return value >= minWidth ? 'met' : 'unmet';
  }
  if (value === true) return 'met';
  if (value === false) return 'unmet';
  return 'unknown';
}

export function assess(practice, needs, now = new Date()) {
  const checks = needs.keys.map((key) => {
    const field = practice.evidence[key] || { value: null, status: 'unknown' };
    const state = evidenceState(field, now);
    const fit = criterionFit(key, field.value, state, needs.minWidth);
    return {
      key,
      label: criteria[key].label,
      value: field.value ?? null,
      state,
      fit,
      source: field.source || practice.source,
      date: field.date || null,
      question: criteria[key].question,
    };
  });
  const met = checks.filter((c) => c.fit === 'met').length,
    unmet = checks.filter((c) => c.fit === 'unmet').length,
    unknown = checks.length - met - unmet;
  return {
    ...practice,
    checks,
    met,
    unmet,
    unknown,
    category: unmet ? 'obstacle' : unknown ? 'check' : checks.length ? 'supported' : 'unassessed',
    score: unmet ? -1000 - unmet * 10 + met : met * 10 - unknown,
  };
}
export function search(practices, input) {
  validateInput(input);
  const needs = parseNeeds(input.needs, input.width);
  const results = practices
    .filter((practice) => practice.mode === 'real')
    .filter((p) => !input.district || p.postalCode === input.district)
    .filter((p) => !input.specialty || p.specialty === input.specialty)
    .map((p) => assess(p, needs))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'));
  return {
    needs,
    results,
    mode: 'real',
    ranking:
      'Besoins documentés, puis inconnus ; obstacles connus en dernier. Pas de distance calculée.',
  };
}
export function briefing(practice, needs) {
  const result = assess(practice, needs);
  return {
    name: practice.name,
    address: practice.address,
    mode: practice.mode,
    known: result.checks.filter((c) => c.fit === 'met').map((c) => c.label),
    obstacles: result.checks.filter((c) => c.fit === 'unmet').map((c) => c.label),
    questions: result.checks.filter((c) => c.fit !== 'met').map((c) => c.question),
    script:
      'Bonjour, je souhaite prendre rendez-vous. Pouvez-vous confirmer les points suivants pour préparer mon déplacement ?',
    doctolibUrl: safeDoctolib(practice.doctolibUrl),
    sourceUrl: practice.sourceUrl,
  };
}
export function safeDoctolib(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      ['www.doctolib.fr', 'doctolib.fr'].includes(u.hostname) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}

export function safeWebsite(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      host === 'doctolib.fr' ||
      host === 'www.doctolib.fr' ||
      host.endsWith('.doctolib.fr')
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}

export function safeAccesLibre(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      u.hostname === 'acceslibre.beta.gouv.fr' &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}

const DOCTOLIB_SPECIALTY_SLUGS = {
  'Médecin généraliste': 'medecin-generaliste',
  'Dentiste, chirurgien dentiste': 'chirurgien-dentiste',
  Kinésithérapeute: 'masseur-kinesitherapeute',
  'Médecin orl': 'orl',
  'Maison de santé ou centre de santé': 'centre-de-sante',
};

function slugifyPlace(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Outbound Doctolib directory link only — never invents a practitioner profile. */
export function doctolibDirectoryUrl(specialty, placeLabel) {
  const slug = DOCTOLIB_SPECIALTY_SLUGS[specialty];
  if (!slug) return 'https://www.doctolib.fr/';
  const label = String(placeLabel || '');
  const city =
    label.match(/\b\d{5}\s+([^,]+)$/)?.[1] ||
    (!/\d/.test(label) ? label : '') ||
    label.split(/\s+/).at(-1) ||
    '';
  const place = slugifyPlace(city);
  return place ? `https://www.doctolib.fr/${slug}/${place}` : 'https://www.doctolib.fr/';
}
