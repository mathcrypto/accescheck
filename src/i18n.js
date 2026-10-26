// Interface language for the home page. French is the source text; English is applied by
// replacing known French phrases in rendered text, so existing renderers stay unchanged.
// shortcut: phrase replacement, not message keys; move to keyed messages if more languages come.
function storedLang() {
  try {
    const requested = new URLSearchParams(location.search).get('lang');
    if (requested === 'en' || requested === 'fr') localStorage.setItem('lang', requested);
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
}
export const lang = storedLang() === 'en' ? 'en' : 'fr';

export function setLang(value) {
  try {
    localStorage.setItem('lang', value);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.set('lang', value);
  location.href = url.href;
}

const en = {
  // Page, header and composer
  'AccèsCheck · Préparer votre rendez-vous': 'AccèsCheck · Prepare your appointment',
  'Décrivez vos besoins, confirmez vos critères et préparez votre rendez-vous médical.':
    'Describe your needs, confirm your criteria and prepare your medical appointment.',
  'Façade vitrée d’un hôpital derrière des branches d’arbres.':
    'Glass facade of a hospital behind tree branches.',
  'Photo d’illustration ·': 'Illustration photo ·',
  'Avant votre rendez-vous': 'Before your appointment',
  'Trouvez un cabinet adapté à vos besoins.': 'Find a practice that fits your needs.',
  'Vos critères d’abord. La proximité ensuite.': 'Your criteria first. Distance second.',
  'Décrivez vos besoins d’accès. Comparez les informations des cabinets et préparez les questions à leur poser.':
    'Describe your access needs. Compare practice information and prepare the questions to ask them.',
  'Aller à la recherche': 'Go to search',
  'Chercher un cabinet': 'Find a practice',
  'De quoi avez-vous besoin pour votre rendez-vous ?': 'What do you need for your appointment?',
  'Un dentiste à Lyon, une entrée sans marche…': 'A dentist in Lyon, step-free entrance…',
  'Votre message': 'Your message',
  'Envoyer mon message': 'Send my message',
  'Chat de recherche de cabinet': 'Practice search chat',
  'Conversation de recherche': 'Search conversation',
  Échanges: 'Messages',
  Interrompre: 'Stop',
  'Tout effacer': 'Clear all',
  'Texte agrandi activé. Conversation, choix et fiches sont plus grands, avec un contraste renforcé.':
    'Larger text on. Conversation, choices and cards are bigger, with stronger contrast.',
  'Texte agrandi': 'Larger text',
  'Affichage standard rétabli.': 'Standard display restored.',
  'Arrêter la lecture': 'Stop reading',
  'Lire la page': 'Read the page',
  'Je prépare un résumé de la page': 'Preparing a summary of the page',
  'Assistance OpenAI': 'OpenAI assistance',
  'La recherche locale reste disponible. Avec votre accord, les messages de besoins et, pour « Lire la page », le texte visible à résumer sont transmis à OpenAI. Aucun texte n’est enregistré par l’application. Ne donnez pas votre nom ni vos coordonnées.':
    'Local search remains available. With your consent, your needs messages and, for “Read the page”, the visible text to summarise are sent to OpenAI. The app stores no text. Do not give your name or contact details.',
  'J’accepte l’envoi de ma demande, du lieu et du contexte de cette conversation à OpenAI.':
    'I agree to send my request, the location and this conversation’s context to OpenAI.',
  'Enrichir les trois premières fiches avec des avis publics (OpenAI).':
    'Add public reviews to the first three cards (OpenAI).',
  'Seule l’identité publique du cabinet est utilisée. Les fiches suivantes sont enrichies à la demande.':
    'Only the practice’s public identity is used. Further cards are enriched on request.',
  'Vérification de l’agent…': 'Checking the agent…',
  'OpenAI disponible avec votre accord.': 'OpenAI available with your consent.',
  'Agent indisponible. Annuaire public disponible en mode dégradé.':
    'Agent unavailable. Public directory available in fallback mode.',
  'Sources : Accès Libre pour les cabinets ; IGN pour les adresses. Les faits déclarés restent visibles avec leur provenance.':
    'Sources: Accès Libre for practices; IGN for addresses. Declared facts stay visible with their origin.',
  'Sources :': 'Sources:',
  'Mettre les animations en pause': 'Pause animations',
  'Relancer les animations': 'Resume animations',
  'Navigation principale': 'Main navigation',
  'AccèsCheck, accueil': 'AccèsCheck, home',
  'Décrire mes besoins': 'Describe my needs',
  'Pendant la visite': 'During the visit',
  Accueil: 'Home',

  // Conversation
  Vous: 'You',
  'Envoi de la demande': 'Sending the request',
  'L’agent OpenAI examine votre demande': 'The OpenAI agent is reviewing your request',
  'Recherche géographique IGN': 'IGN location lookup',
  'Recherche des cabinets dans Accès Libre': 'Searching practices in Accès Libre',
  'Consultation des preuves de la fiche': 'Checking the card’s evidence',
  'Recherche web sur l’identité publique du cabinet':
    'Web search on the practice’s public identity',
  'Votre recherche': 'Your search',
  'Voir la conversation et les critères': 'Show the conversation and criteria',
  'Accepter et poursuivre': 'Accept and continue',
  'Confirmer et chercher': 'Confirm and search',
  'Saisir ma réponse': 'Type my answer',
  'Je ne sais pas': 'I don’t know',
  Réessayer: 'Retry',
  'Consulter l’annuaire public': 'Open the public directory',
  'Vous pouvez aussi consulter les fiches publiques sans interprétation de votre demande.':
    'You can also browse the public cards without your request being interpreted.',
  'Vous pouvez reprendre cette demande ou écrire une correction.':
    'You can resume this request or write a correction.',
  'Recherche interrompue.': 'Search stopped.',
  'Conversation effacée.': 'Conversation cleared.',
  'Vérifiez ces critères, puis confirmez pour lancer la recherche. Vous pouvez les corriger dans votre message.':
    'Check these criteria, then confirm to start the search. You can correct them in your message.',
  'Votre accord est nécessaire pour envoyer votre demande complète, le lieu et le contexte de cette conversation à OpenAI.':
    'Your consent is needed to send your full request, the location and this conversation’s context to OpenAI.',
  'Évitez les noms et coordonnées personnelles.': 'Avoid names and personal contact details.',
  'L’agent est injoignable. Réessayez ou ouvrez l’annuaire public.':
    'The agent cannot be reached. Retry or open the public directory.',
  'L’agent OpenAI est indisponible. Réessayez ou ouvrez l’annuaire public.':
    'The OpenAI agent is unavailable. Retry or open the public directory.',
  'Limite OpenAI atteinte. Réessayez plus tard ou ouvrez l’annuaire public.':
    'OpenAI limit reached. Retry later or open the public directory.',
  'Réponse de l’agent incomplète. Réessayez votre demande.':
    'Incomplete agent reply. Please retry your request.',
  'La réponse de l’agent n’a pas pu être vérifiée. Réessayez.':
    'The agent’s reply could not be verified. Please retry.',
  'La recherche confirmée n’a pas été exécutée par l’agent. Réessayez pour lancer cette même recherche.':
    'The agent did not run the confirmed search. Retry to run the same search.',
  'Conversation expirée ou modifiée. Effacez-la pour recommencer.':
    'Conversation expired or modified. Clear it to start again.',
  'Écrivez votre demande.': 'Write your request.',

  // Recap and criteria
  'Profession sans préférence': 'Any profession',
  'Sans contrainte géographique': 'No location constraint',
  'Rayon sans limite précise': 'No precise radius limit',
  'km à vol d’oiseau': 'km as the crow flies',
  'Dentiste, chirurgien dentiste': 'Dentist, dental surgeon',
  Dentiste: 'Dentist',
  Kinésithérapeute: 'Physiotherapist',
  'Médecin généraliste': 'General practitioner',
  'Autres activités des médecins spécialistes': 'Other medical specialists',
  'Maison de santé ou centre de santé': 'Health centre',
  'Médecin orl': 'ENT doctor',
  'Médecine du travail': 'Occupational medicine',
  'Soin, médecine douce': 'Care, alternative medicine',
  'Entrée sans marche': 'Step-free entrance',
  'Trajet jusqu’à l’accueil': 'Step-free route to reception',
  'Largeur de la porte d’entrée': 'Entrance door width',
  'Équipement auditif': 'Hearing equipment',
  'Sanitaires adaptés': 'Accessible toilets',
  'Salle de consultation accessible': 'Accessible consultation room',
  'Signalétique intérieure': 'Indoor signage',
  'Communication en LSF': 'French Sign Language (LSF)',
  'Aménagements sensoriels': 'Sensory adjustments',
  'Communication adaptée': 'Adapted communication',
  'Passage ≥': 'Passage ≥',

  // Results and cards
  'Résultats · hors conversation': 'Results · outside the conversation',
  'Les informations pour votre visite': 'Information for your visit',
  'Accessibilité, puis proximité, puis réputation si renseignée.':
    'Accessibility first, then distance, then reputation when known.',
  'fiche(s) · page': 'card(s) · page',
  'Résultats suivants →': 'Next results →',
  '← Précédent': '← Previous',
  'Accès Libre · export du': 'Accès Libre · export of',
  'obstacle(s) connu(s) exclu(s). Distances depuis votre adresse, aucun itinéraire vérifié.':
    'known obstacle(s) excluded. Distances from your address, no verified route.',
  'Cabinet ou établissement': 'Practice or facility',
  'Accès non évalué': 'Access not assessed',
  'Critères documentés': 'Criteria documented',
  'À confirmer': 'To be confirmed',
  'à confirmer auprès du cabinet': 'to confirm with the practice',
  'non documenté': 'not documented',
  'Distance non calculée': 'Distance not calculated',
  'km de votre adresse': 'km from your address',
  'depuis le centre du lieu choisi': 'from the centre of the chosen place',
  'Ancien · à confirmer': 'Old · to be confirmed',
  'Contradictoire · à confirmer': 'Contradictory · to be confirmed',
  'Appuyé par une photo': 'Backed by a photo',
  'Confirmé par des patients': 'Confirmed by patients',
  Contradictoire: 'Contradictory',
  Déclaré: 'Declared',
  Inconnu: 'Unknown',
  Ancien: 'Old',
  'date non renseignée': 'date not given',
  'Aucun besoin d’accès comparé. Consultez les informations déclarées avant votre visite.':
    'No access need compared. Check the declared information before your visit.',
  'Détails et provenance': 'Details and origin',
  'Identité individuelle non vérifiée.': 'Individual identity not verified.',
  'Les dates absentes restent non renseignées. Une déclaration n’est pas une garantie d’accès.':
    'Missing dates stay unknown. A declaration is not a guarantee of access.',
  'Inscription RPPS : non vérifiée. Secteur, tarifs et Carte Vitale : non renseignés dans cette source. Aucune note globale n’est calculée.':
    'RPPS registration: not verified. Sector, fees and Carte Vitale: not given in this source. No overall score is calculated.',
  'Source :': 'Source:',
  'Chercher sur Doctolib ↗': 'Search on Doctolib ↗',
  'Chercher la fiche Doctolib de ce cabinet sur Google (nouvel onglet)':
    'Search Google for this practice’s Doctolib page (new tab)',
  'Aucun profil Doctolib dans la source : le lien cherche la fiche via Google, sans garantie.':
    'No Doctolib profile in the source: the link searches for it via Google, without guarantee.',
  'Préparer ↗': 'Prepare ↗',
  'Préparer l’échange (nouvel onglet, votre recherche reste ouverte)':
    'Prepare the conversation (new tab, your search stays open)',
  'Préparer l’échange': 'Prepare the conversation',
  'nouvel onglet': 'new tab',
  Oui: 'Yes',
  Non: 'No',
  'Meilleur choix · accès, proximité, avis': 'Best match · access, distance, reviews',

  // Reviews
  'Avis publics': 'Public reviews',
  'Avis insuffisants pour un ressenti général': 'Not enough reviews for an overall impression',
  'Retours consultés plutôt favorables': 'Reviews mostly positive',
  'Difficultés dans les retours consultés': 'Reviews report difficulties',
  'Retours consultés partagés': 'Mixed reviews',
  'Réputation non renseignée': 'Reputation unknown',
  'Détail des avis et sources': 'Review details and sources',
  'Rechercher les avis avec OpenAI': 'Find reviews with OpenAI',
  'Recherche d’avis indisponible': 'Review search unavailable',
  'Recherche d’avis demandée · identité publique uniquement.':
    'Review search requested · public identity only.',
  'Recherche d’avis interrompue.': 'Review search stopped.',
  'Je consulte les avis publics': 'Checking public reviews',
  'Réessayer les avis': 'Retry reviews',
  'Avis indisponibles. Réessayez.': 'Reviews unavailable. Please retry.',
  'source(s) attribuable(s)': 'attributable source(s)',
  'Consulté le': 'Checked on',
  'Collecte partielle.': 'Partial collection.',
  'avis identifiable(s)': 'identifiable review(s)',
  'Échantillon limité, sans garantie de représentativité.':
    'Limited sample, not guaranteed to be representative.',
  'Accueil, écoute, attente et organisation': 'Welcome, listening, waiting and organisation',
  'retours favorables': 'positive feedback',
  'difficultés rapportées': 'difficulties reported',
  contrasté: 'mixed',
  'non renseigné': 'unknown',
  'favorable(s)': 'positive',
  'difficulté(s)': 'difficulty(ies)',
  'partagé(s)': 'mixed',
  Écoute: 'Listening',
  Attente: 'Waiting',
  Organisation: 'Organisation',
  'Aucun avis attribuable trouvé dans les pages consultées. Réputation non renseignée.':
    'No attributable review found in the pages checked. Reputation unknown.',
  'Établissement identifié': 'Facility identified',
  'Avis d’un praticien ou périmètre différent · non attribué au cabinet':
    'Practitioner review or different scope · not attributed to the practice',
  'Homonyme ou adresse ambiguë · non attribué': 'Same name or ambiguous address · not attributed',
  'Identité à confirmer · non attribué': 'Identity to be confirmed · not attributed',
  'Note non renseignée': 'Rating unknown',
  'volume non renseigné': 'volume unknown',
  'avis sur ce site': 'reviews on this site',
  'date des données non renseignée': 'data date unknown',
  'mis à jour le': 'updated on',
  'Toutes les pages consultées': 'All pages checked',
  'Les témoignages ne prouvent ni l’accessibilité ni la qualité clinique.':
    'Testimonials prove neither accessibility nor clinical quality.',
};
// Longest phrases first so a sentence wins over the words inside it.
const phrases = Object.keys(en).sort((a, b) => b.length - a.length);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Single words only match whole words, so « Non » never changes « Nonce » or a name.
const pattern = new RegExp(
  phrases
    .map(
      (phrase) =>
        (/\s/.test(phrase) ? '' : '(?<![\\p{L}])') +
        // HTML source wraps long sentences, so any run of whitespace matches a space.
        escape(phrase).replace(/ /g, '\\s+') +
        (/\s/.test(phrase) ? '' : '(?![\\p{L}])'),
    )
    .join('|'),
  'gu',
);
export const translate = (text) =>
  lang === 'en' && text
    ? text.replace(pattern, (match) => en[match.replace(/\s+/g, ' ')] ?? match)
    : text;

// The patient's own words and practice identities are never rewritten.
const untouched = '.bubble.user .say, .practice-card h3, .address, script, style';
function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement?.closest(untouched)) return;
    const value = translate(node.nodeValue);
    if (value !== node.nodeValue) node.nodeValue = value;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest(untouched)) return;
  for (const name of ['placeholder', 'aria-label', 'title', 'alt', 'content']) {
    const value = node.getAttribute(name);
    if (value && translate(value) !== value) node.setAttribute(name, translate(value));
  }
  for (const child of node.childNodes) translateNode(child);
}

export function applyLanguage() {
  document.documentElement.lang = lang;
  if (lang !== 'en') return;
  document.title = translate(document.title);
  translateNode(document.head);
  translateNode(document.body);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translateNode(record.target);
      else if (record.type === 'attributes') translateNode(record.target);
      else record.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title'],
  });
}
