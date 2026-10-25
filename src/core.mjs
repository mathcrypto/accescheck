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
export function parseNeeds(text, width) {
  const t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const keys = new Set();
  const wheelchair = /fauteuil|wheelchair|mobilite reduite|deambulateur/.test(t);
  if (wheelchair || /sans marche|plain.pied|step.free|bequille/.test(t)) {
    keys.add('stepFree');
    keys.add('route');
  }
  if (wheelchair) {
    keys.add('width');
    keys.add('consultation');
  }
  if (/malentendant|sourd|auditi|hard of hearing|hearing/.test(t)) keys.add('hearing');
  if (/toilet|sanitaire/.test(t)) keys.add('toilets');
  if (/malvoyant|aveugle|signaleti|visuel|blind/.test(t)) keys.add('signage');
  if (/transfert|transfer/.test(t)) keys.add('consultation');
  const match = t.match(/\b(\d{2,3})\s*cm\b/);
  const requested = width ?? (match ? Number(match[1]) : null);
  if (requested !== null && (requested < 40 || requested > 200))
    throw new Error('Largeur attendue : 40 à 200 cm.');
  if (requested !== null) keys.add('width');
  return {
    keys: [...keys],
    minWidth: requested,
    clarification:
      keys.size === 0
        ? 'Précisez un besoin ou sélectionnez un exemple ci-dessus.'
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
