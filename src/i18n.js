// Interface language shared by all pages. French is the source text; English is applied by
// replacing known French phrases in rendered text, so existing renderers stay unchanged.
// shortcut: phrase replacement, not message keys; move to keyed messages if more languages come.
import { consultationEnglish } from './consultation-i18n.js';
function storedLang() {
  const requested = new URLSearchParams(globalThis.location?.search || '').get('lang');
  if (requested === 'en' || requested === 'fr') {
    try {
      localStorage.setItem('lang', requested);
    } catch {}
    return requested;
  }
  try {
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
}
export const lang = storedLang() === 'en' ? 'en' : 'fr';
export const locale = lang === 'en' ? 'en-GB' : 'fr-FR';

const en = {
  ...consultationEnglish,
  'AccèsCheck · Mon profil d’accès': 'AccèsCheck · My access profile',
  'Aller au profil d’accès': 'Go to access profile',
  'Pour vos prochaines recherches': 'For your next searches',
  'Votre profil d’accès.': 'Your access profile.',
  'L’agent extrait vos besoins directement dans la conversation « Décrire mes besoins ». Vous choisissez ensuite de les conserver depuis le chat pour la prochaine fois.':
    'The agent extracts your needs directly from the “Describe my needs” conversation. You can then choose to save them from the chat for next time.',
  'Votre profil se crée dans la recherche.': 'Your profile starts in the search.',
  'Décrivez vos besoins avec vos mots. L’agent vous propose des critères à vérifier, puis un enregistrement facultatif sur cet appareil.':
    'Describe your needs in your own words. The agent suggests criteria to check, which you can choose to save on this device.',
  'À partir de votre demande': 'From your request',
  'Les besoins que vous avez confirmés.': 'The needs you have confirmed.',
  'EXEMPLE FICTIF conservé · ne représente pas vos besoins réels.':
    'Saved FICTIONAL EXAMPLE · does not represent your real needs.',
  'Critères extraits par l’agent de votre demande, puis confirmés par vous.':
    'Criteria extracted from your request by the agent, then confirmed by you.',
  'Largeur minimale non renseignée : aucune mesure supposée.':
    'Minimum width unknown: no measurement assumed.',
  'Largeur minimale confirmée :': 'Confirmed minimum width:',
  'Réutilisable sur ce navigateur jusqu’au': 'Reusable in this browser until',
  'Modifier via Décrire mes besoins': 'Edit through Describe my needs',
  'Supprimer mon profil': 'Delete my profile',
  'Sur l’accueil, « Utiliser mon profil » prépare votre demande sans l’envoyer. Décrivez une correction dans le chat pour obtenir un nouveau profil à confirmer.':
    'On the home page, “Use my profile” prepares your request without sending it. Describe a correction in the chat to get a new profile to confirm.',
  'Vous gardez la main.': 'You stay in control.',
  'Seuls les critères et la largeur éventuelle sont conservés dans ce navigateur, après votre accord distinct. Ni la demande, ni la conversation, ni le lieu ne sont enregistrés.':
    'Only the criteria and optional width are saved in this browser, with your separate consent. The request, conversation and location are not saved.',
  'Le profil expire après 30 jours et est supprimé à la prochaine lecture après expiration. Aucun compte ni synchronisation entre appareils. Les autres utilisateurs de ce navigateur peuvent le voir : évitez un appareil partagé.':
    'The profile expires after 30 days and is deleted the next time it is read after expiry. There is no account or sync between devices. Other people using this browser can see it: avoid shared devices.',
  'Revenir à Décrire mes besoins': 'Back to Describe my needs',
  'Un profil confirmé ne garantit pas l’accessibilité d’un cabinet.':
    'A confirmed profile does not guarantee that a practice is accessible.',
  'La mémoire de ce navigateur est indisponible. Vous pouvez continuer à décrire vos besoins sans les conserver.':
    'Browser storage is unavailable. You can still describe your needs without saving them.',
  'Profil supprimé de cet appareil.': 'Profile deleted from this device.',
  'La suppression a échoué. Vérifiez les réglages de stockage du navigateur.':
    'Deletion failed. Check your browser storage settings.',
  'Exemple fictif à tester, pas mes besoins réels.':
    'Fictional example for testing, not my real needs.',
  'Pour ma recherche, voici mes besoins d’accès à vérifier :':
    'For my search, these are my access needs to check:',
  'Passage utile d’au moins': 'Clear width of at least',
  'Demandez-moi la profession et le lieu pour cette nouvelle recherche.':
    'Ask me for the profession and location for this new search.',
  'EXEMPLE FICTIF · ': 'FICTIONAL EXAMPLE · ',
  'Votre profil d’accès se crée directement à partir de cette conversation.':
    'Your access profile is created directly from this conversation.',
  'Vos besoins sont déjà là.': 'Your access needs are already here.',
  'Utiliser mon profil': 'Use my profile',
  'Consulter ou supprimer mon profil': 'View or delete my profile',
  'Profil enregistré': 'Saved profile',
  'Mon profil d’accès': 'My access profile',
  'Profil extrait de votre demande': 'Profile extracted from your request',
  'Corrigez les critères dans le chat avant de les enregistrer si nécessaire.':
    'Correct the criteria in the chat before saving them if necessary.',
  'Je confirme ces besoins et j’accepte de les garder sur cet appareil pendant 30 jours.':
    'I confirm these needs and agree to keep them on this device for 30 days.',
  'Ce navigateur conserve uniquement les critères et la largeur. Les autres utilisateurs de cet appareil peuvent les voir.':
    'This browser keeps only the criteria and width. Other people using this device can see them.',
  'Enregistrer mon profil d’accès': 'Save my access profile',
  'Critères enregistrés pour 30 jours. La conversation et le lieu ne sont pas conservés.':
    'Criteria saved for 30 days. The conversation and location are not saved.',
  'Ce navigateur refuse l’enregistrement du profil. Votre recherche reste utilisable.':
    'This browser could not save the profile. You can still search.',
  'Votre message en cours est conservé. Affichez-le ou effacez-le avant de reprendre le profil.':
    'Your current message is kept. Send or clear it before using your profile.',
  'Profil préparé, sans envoi. Vérifiez votre accord OpenAI avant d’envoyer la demande.':
    'Profile prepared without sending. Check your OpenAI consent before sending the request.',
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
  'La recherche locale reste disponible. Avec votre accord, les messages de besoins et, pour « Lire la page », le texte visible à résumer sont transmis à OpenAI. Aucun historique de conversation n’est conservé. Seuls les critères du profil peuvent être gardés sur cet appareil, après un accord distinct. Ne donnez pas votre nom ni vos coordonnées.':
    'Local search remains available. With your consent, your needs messages and, for “Read the page”, the visible text to summarise are sent to OpenAI. Conversation history is not saved. Only profile criteria can be kept on this device with separate consent. Do not give your name or contact details.',
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
  'Ouverture de l’annuaire public': 'Opening the public directory',
  'Annuaire public : aucun besoin ni lieu n’a été interprété.':
    'Public directory: no needs or location have been interpreted.',
  'Mode dégradé sans agent. Les besoins d’accès restent à vérifier sur chaque fiche.':
    'Fallback mode without an agent. Access needs still need to be checked on each card.',
  'L’agent OpenAI est indisponible. Vous pouvez consulter l’annuaire public en mode dégradé.':
    'The OpenAI agent is unavailable. You can browse the public directory in fallback mode.',
  'Évitez les noms et coordonnées personnels.': 'Avoid names and personal contact details.',
  'Résultats de la recherche confirmée.': 'Results for the confirmed search.',
  'Ordre des fiches invalide. Actualisez la recherche.': 'Invalid card order. Refresh the search.',
  'Confirmez une recherche avant de changer de page.': 'Confirm a search before changing page.',
  'Ce choix ne correspond plus à la question actuelle.':
    'This choice no longer matches the current question.',
  'Aucune proposition à confirmer.': 'There is no proposal to confirm.',
  'Lieu non vérifié par IGN.': 'Location not verified by IGN.',
  'Un rayon nécessite un point IGN vérifié.': 'A radius requires an IGN-verified location.',
  'Profession absente du catalogue.': 'Profession missing from the catalogue.',
  'La largeur nécessite le critère passage large.': 'A width requires the wide entrance criterion.',
  'Un accord distinct est nécessaire pour consulter les avis.':
    'Separate consent is needed to check reviews.',
  'Limite de recherche web atteinte pour ce tour.': 'Web search limit reached for this turn.',
  'Contexte trop volumineux. Précisez votre recherche.':
    'The context is too large. Narrow down your search.',
  'Limite de contexte de recherche atteinte. Précisez votre demande.':
    'Search context limit reached. Narrow down your request.',
  'Limite d’outils atteinte. Précisez votre recherche.':
    'Tool limit reached. Narrow down your search.',
  'Limite de recherche atteinte. Précisez votre demande ; aucune recherche supplémentaire n’a été lancée.':
    'Search limit reached. Narrow down your request; no further search was started.',
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
  'Passage ≥': 'Clear width ≥',

  // Results and cards
  'Résultats · hors conversation': 'Results · outside the conversation',
  'Les informations pour votre visite': 'Information for your visit',
  'Détails · besoins à confirmer': 'Details · needs to confirm',
  'Fiche Accès Libre ↗': 'Accès Libre card ↗',
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
const untouched =
  '.bubble.user .say, .practice-card h3, .address, #transcript .say, #interim, #practiceName, #practiceAddress, #langSwitch, script, style';
function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement?.closest(untouched + ', textarea')) return;
    const value = translate(node.nodeValue);
    if (value !== node.nodeValue) node.nodeValue = value;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest(untouched)) return;
  if (node.matches('a[href^="/"]') && !node.getAttribute('href').startsWith('//')) {
    const url = new URL(node.href);
    url.searchParams.set('lang', lang);
    const href = url.pathname + url.search + url.hash;
    if (node.getAttribute('href') !== href) node.setAttribute('href', href);
  }
  for (const name of ['placeholder', 'aria-label', 'title', 'alt', 'content']) {
    if (name === 'aria-label' && node.matches('.practice-card')) continue;
    const value = node.getAttribute(name);
    if (value && translate(value) !== value) node.setAttribute(name, translate(value));
  }
  for (const child of node.childNodes) translateNode(child);
}

export function applyLanguage() {
  document.documentElement.lang = lang;
  const switchLink = document.getElementById('langSwitch');
  const next = lang === 'en' ? 'fr' : 'en';
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  switchLink.textContent = next === 'fr' ? 'Français' : 'English';
  switchLink.lang = next;
  switchLink.hreflang = next;
  switchLink.href = url.pathname + url.search + url.hash;
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
    attributeFilter: ['placeholder', 'aria-label', 'title', 'alt', 'content', 'href'],
  });
}
