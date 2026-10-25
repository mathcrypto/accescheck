# AccèsCheck — recherche conversationnelle

Statut : proposition de cadrage à relire. Ce document définit le besoin et les lots ; il ne décrit pas des fonctionnalités déjà livrées. Les spécifications détaillées suivront les frontières retenues ici.

## Besoin

Un patient décrit sa recherche dans un chat. L’agent reprend les détails déjà donnés, demande seulement les précisions nécessaires avec des choix courts, puis présente les praticiens ou cabinets qui correspondent à la demande. Le patient peut corriger une réponse et affiner les résultats dans la même conversation.

L’objectif est de remplacer « Ma recherche accompagnée » et les formulaires de recherche parallèles par un seul parcours conversationnel. Le nom AccèsCheck et le design noir et blanc restent la référence.

## Décisions et hypothèses

- Confirmé par l’utilisateur : classement par **accessibilité → proximité → réputation**. Une bonne réputation ne compense pas un obstacle connu sur un besoin indispensable.
- Confirmé par l’utilisateur : l’agent OpenAI doit pouvoir rechercher des avis provenant de plusieurs sources. Aucun fournisseur unique n’est choisi.
- Hypothèse à relire : conserver l’introduction avec la photo, puis le chat à la place du formulaire actuel. La page de consultation reste disponible après la sélection d’un cabinet.
- Proposition : le chat s’ouvre dans la zone de recherche de l’accueil ; les anciennes routes de recherche mènent au même parcours. Le texte saisi reste en mémoire et ne transite pas dans une URL.
- Réutiliser le finder, Accès Libre et le géocodage IGN existants. Les critères confirmés commandent une recherche déterministe ; le modèle ne fabrique ni cabinet ni preuve d’accessibilité.

## Carte des fonctionnalités proposée

| Identifiant stable | Résultat attendu                                                                                                                          | Dépend de          | Branche de réalisation     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------- |
| `chat-only-entry`  | Un seul point d’entrée de recherche ; disparition du lien et de la page « Ma recherche accompagnée », avec redirection des anciens accès. | —                  | `feature/chat-only-entry`  |
| `needs-dialogue`   | L’agent comprend la demande et complète les informations manquantes avec des QCM contextuels.                                             | `chat-only-entry`  | `feature/needs-dialogue`   |
| `practice-results` | Liste de praticiens/cabinets expliquée, corrigible depuis le chat, selon l’ordre de classement confirmé.                                  | `needs-dialogue`   | `feature/practice-results` |
| `agent-activity`   | Réponse progressive et astérisque rouge animé pendant les étapes réellement en cours.                                                     | `needs-dialogue`   | `feature/agent-activity`   |
| `review-sources`   | L’agent retrouve des avis publics de plusieurs sources et les rattache au bon praticien ou cabinet.                                       | `practice-results` | `feature/review-sources`   |
| `review-sentiment` | Synthèse sourcée de l’expérience rapportée et indicateur de réputation quand les données le permettent.                                   | `review-sources`   | `feature/review-sentiment` |

Ordre proposé : entrée unique → questions → résultats → activité visuelle → sources d’avis → synthèse. Chaque lot suit branche → tests → revue → fusion dans `main` → CI, puis nettoyage de son worktree. Les lots qui touchent le même chat seront intégrés l’un après l’autre.

## Parcours attendu

1. Le patient écrit par exemple : « Je cherche un dentiste à Lyon, je me déplace en fauteuil. »
2. Le chat reprend les informations fournies et demande uniquement la précision utile suivante. Il ne redemande pas la profession ou la ville déjà comprises.
3. Le patient répond par un choix ou en texte libre. Il peut revenir sur une réponse. Une correction invalide les résultats devenus obsolètes.
4. Le chat présente un récapitulatif court et modifiable des contraintes retenues. Une confirmation claire suffit ; aucun second formulaire à compléter.
5. Le chat présente les résultats. Les avis peuvent enrichir progressivement les premières fiches, sans retarder l’affichage de la recherche d’accessibilité.
6. Le patient affine la recherche, ouvre la source ou prépare la consultation. La liste reste disponible dans l’onglet de recherche.

## Questions à choix à reprendre du parcours accompagné

Une question à la fois, seulement si la réponse manque ou si la demande est ambiguë. Les choix proposés viennent du catalogue ou du contexte ; la saisie libre reste disponible.

| Sujet                     | Exemples de choix ou réponse                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Profession                | Généraliste / Dentiste / Kinésithérapeute / Autre / Sans préférence. Ne pas déduire une spécialité d’un handicap.                  |
| Lieu                      | Ville, quartier ou adresse saisis, puis confirmation d’un lieu trouvé par IGN. Sans contrainte géographique possible si explicite. |
| Rayon                     | 1 / 3 / 5 / 10 km / Sans limite, quand une limite de déplacement est utile.                                                        |
| Accès indispensable       | Sans marche / Passage large / Communication adaptée / Autre besoin / Pas de contrainte particulière.                               |
| Largeur                   | Mesure en cm ou mètres / Je ne sais pas. Ne jamais supposer une largeur liée au fauteuil.                                          |
| Audition et communication | Échange écrit / Équipement auditif / LSF / Autre, selon le besoin exprimé.                                                         |
| Vision et sensoriel       | Signalétique / Aide à l’orientation / Calme ou lumière adaptée / Autre, si pertinent.                                              |
| Autres besoins            | Sanitaires adaptés ou question précise à confirmer auprès du cabinet.                                                              |

« Je ne sais pas » conserve une information inconnue et permet de continuer quand elle n’est pas bloquante. Une donnée absente sur un cabinet reste à confirmer. La salle de consultation et le transfert, souvent non documentés, restent des questions explicites au cabinet plutôt qu’une accessibilité présumée.

## Conversation et animation

- Conserver Helvetica, l’en-tête translucide et l’astérisque rouge net. Utiliser le même signe comme indicateur discret dans le chat, avec une lueur et une pulsation douce pendant le travail.
- Montrer des états compréhensibles correspondant aux actions réelles : « Je précise votre recherche », « Je cherche les cabinets », puis « Je consulte les avis » si cette étape est active.
- Afficher la réponse à mesure qu’elle arrive lorsque le serveur le permet. Les états ne simulent pas une pensée interne ni des outils qui n’ont pas été appelés.
- Prévoir interruption, erreur, nouvelle tentative et retour à la saisie ; une nouvelle demande ne doit pas recevoir le résultat d’une ancienne recherche.
- Respecter le clavier, les lecteurs d’écran et la réduction des animations. L’icône reste fixe en mouvement réduit, avec un statut textuel lisible.

## Résultats et réputation

Une fiche doit permettre de comprendre le choix : identité, profession, adresse, distance, critères documentés, points inconnus, provenance et actions utiles. Il faut distinguer un praticien individuel d’un cabinet ou établissement.

La réputation ajoutera des notes et volumes d’avis lorsqu’ils sont effectivement disponibles, puis une synthèse courte des avis consultés : accueil, écoute, clarté des explications, attente et organisation. Elle indiquera les sources, les dates disponibles, la date de consultation et l’étendue réelle de la collecte. Des avis contradictoires resteront visibles dans la synthèse.

La note d’un cabinet ne sera pas attribuée à un médecin qui y exerce sans correspondance explicite. Des homonymes ou adresses ambiguës empêchent le rattachement automatique. Une même publication reprise sur plusieurs sites ne constitue pas plusieurs avis indépendants. Les notes de plateformes différentes restent identifiées par source.

« Réputation non renseignée » et « Avis insuffisants pour une synthèse » sont des résultats normaux. Une absence d’avis ne devient pas une mauvaise réputation. Les témoignages ne prouvent ni la qualité clinique ni l’accessibilité physique d’un lieu.

## Agent OpenAI et sources

La documentation OpenAI permet de rechercher sur le web avec l’outil `web_search` de la Responses API et d’obtenir des citations. Les références affichées doivent être visibles et cliquables. Cela fournit une base technique pour une recherche multi-source ; cela ne garantit pas la disponibilité de tous les avis d’une plateforme. [OpenAI Docs — Web search](https://developers.openai.com/api/docs/guides/tools-web-search)

Le déploiement public actuel transmet uniquement la base de praticiens au handler ; ses fonctions OpenAI sont désactivées. Le lot de dialogue devra prévoir la configuration serveur du modèle et l’accord pour envoyer une description de besoins à OpenAI, avec un parcours utilisable en cas d’indisponibilité. Le pont fictif de consultation reste séparé de cette nouvelle recherche patient.

Les appels de réputation utiliseront l’identité publique du praticien/cabinet, pas la description de santé du patient. Les contenus des sites et avis restent des données externes non fiables. Une source consultée peut être inaccessible, partielle ou insuffisante : l’agent doit le signaler, et la recherche principale reste utilisable.

Des connecteurs spécifiques pourront compléter la recherche web selon l’accès proposé par chaque fournisseur. Pour Google Places, l’affichage, les attributions et la conservation des données ont des règles propres, y compris des particularités pour l’EEE. Les résumés natifs d’avis ne sont pas garantis pour tous les lieux ; la documentation consultée ne liste pas la combinaison français/France. Ce fournisseur ne constitue donc pas une solution de synthèse française présumée prête à l’emploi. [Règles Places](https://developers.google.com/maps/documentation/places/web-service/policies), [disponibilité des résumés](https://developers.google.com/maps/documentation/places/web-service/review-summaries).

Avant l’implémentation des avis : préciser les sources accessibles, le modèle compatible, les plafonds d’appels, le nombre de fiches enrichies et la règle de confiance. Proposition de départ à chiffrer : enrichir les trois premières fiches, puis les suivantes à la demande. Aucun achat ni appel API payant ne découle de ce cadrage.

## Points à trancher dans les spécifications de lots

- Valider les frontières et l’ordre proposés dans cette carte avant de rédiger les spécifications de chaque module.
- Confirmer la conservation de l’introduction photo et le point d’entrée unique sur l’accueil.
- Définir le critère d’arrêt des questions et le traitement des besoins que les sources ne documentent pas.
- Préciser le départage par proximité avant réputation, notamment distance exacte ou tranches, sans score global opaque.
- Fixer les sources d’avis effectivement utilisables, le budget et le seuil permettant une synthèse représentative. Le seul fait d’obtenir quelques extraits ne suffit pas à prétendre décrire tous les patients.

Le périmètre ne comprend pas de prise de rendez-vous automatique, de diagnostic, de classement de compétence médicale, ni de collecte exhaustive garantie. La réalisation et ses tests viendront après ce cadrage.
