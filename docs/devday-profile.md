# Variante DevDay : le profil extrait de la demande

Branche `feature/devday-profile`. Le point d’entrée unique est `/#recherche`, la conversation **Décrire mes besoins**. `/profil` sert uniquement à consulter et supprimer le profil déjà enregistré, ou à revenir dans la conversation pour le modifier.

L’utilisateur a explicitement demandé le 26 octobre 2026 de conserver un profil pour une prochaine recherche, puis précisé que l’agent doit l’extraire directement depuis cette conversation. Cette variante constitue une exception volontaire et bornée à la règle habituelle de non-persistance des besoins.

## Un seul parcours

1. Le patient décrit sa recherche et ses besoins dans le chat habituel, avec le consentement OpenAI existant.
2. L’agent de recherche produit déjà une proposition structurée. Le navigateur en extrait uniquement les identifiants de critères d’accès et une largeur éventuelle, sans appel IA supplémentaire. L’offre **Profil extrait de votre demande** montre exactement ces valeurs.
3. Le patient peut écrire une correction dans le chat. Dès qu’il commence cette correction, l’ancienne offre et son accord de stockage sont invalidés. Après la nouvelle réponse, il relit et donne un accord distinct avant **Enregistrer mon profil d’accès**.
4. Au prochain chargement, **Utiliser mon profil** prépare le champ de recherche sans l’envoyer ni accepter le consentement OpenAI. Un brouillon en cours n’est pas écrasé. La profession, le lieu et la confirmation de recherche restent à préciser comme avant.
5. **Consulter ou supprimer mon profil** ouvre `/profil`. La modification se fait en revenant dans Décrire mes besoins ; cette page ne comporte aucun formulaire d’extraction ou de saisie manuelle des critères.

L’offre est invalidée lors d’une nouvelle demande, d’une correction du texte, de la reprise d’un profil enregistré et de l’effacement de la conversation. La signature et les validations serveur de l’état de recherche sont inchangées. Le navigateur ne conserve jamais cet état signé, l’historique, les questions libres, les lieux ou la demande initiale.

Le formulaire autonome, l’exemple autonome et `/api/profile-extract` ont été supprimés pour éviter de demander au patient de réexpliquer ses besoins ailleurs. `interpretNeeds` et ses usages historiques sont inchangés. Les anciens profils sauvegardés restent compatibles ; ceux issus d’un ancien exemple gardent leur marqueur fictif et ne se font pas passer pour des besoins réels.

## Conservation

Le navigateur conserve un seul objet versionné avec les critères, la largeur, un éventuel marqueur fictif et les dates de conservation. Aucun compte, synchronisation entre appareils, stockage serveur, conversation, nom, diagnostic, adresse ou état signé.

Le profil expire après 30 jours. Il n’est plus réutilisable après cette date et est supprimé à la prochaine lecture/ouverture de l’application : un navigateur fermé ne permet pas d’exécuter une purge en arrière-plan. Les objets corrompus, de durée incohérente ou contenant des champs supplémentaires sont supprimés à la lecture. Le refus de stockage est signalé sans bloquer la recherche.

Le profil n’est pas chiffré par l’application. Toute personne utilisant ce navigateur peut le voir ; le chat le signale avant l’accord de conservation. La conservation est déconseillée sur un appareil partagé.

## Vérification

- `npm run check` : format, lint, tests, build et validation de l’artefact.
- `python3 -m unittest discover -s test -p 'test_*.py'`.
- `scripts/check-profile.mjs` : demande ordinaire dans le chat, correction invalidant l’offre précédente, sauvegarde explicite, rechargement, reprise sans envoi, absence de conversation persistée, suppression, corruption, expiration, stockage refusé, gestion vide et stockée aux largeurs 320/390/768/1440.
- `scripts/check-profile-regressions.mjs` : correction d’un brouillon pendant une réponse différée, même après effacement du brouillon ; maintien du marqueur fictif après reprise et nouvel enregistrement ; réinitialisation après « Tout effacer ».

Les réponses de l’agent sont contrôlées dans les tests automatiques. Ces tests ne font aucun appel IA payant et n’utilisent pas de données de santé réelles.

## Vérification ponctuelle avec l’IA réelle

Le 26 octobre 2026, après l’autorisation explicite de l’utilisateur « testa avec L’IA réelle », un navigateur isolé a exécuté le vrai parcours sur le lien VPN HTTPS, sans interception API, IGN ou fournisseur. Le modèle effectivement configuré était `gpt-5.4-mini` ; aucune clé ni configuration n’a été modifiée. Les avis ont été désactivés. Aucune recherche confirmée, réservation ou lecture audio n’a été lancée.

Avec une demande synthétique de dentiste à Lyon 3e, rayon 3 km, entrée et trajet sans marche et passage minimal de 90 cm, l’agent a produit les trois critères `stepFree`, `route`, `width` et la largeur 90. La proposition observée a demandé environ 4,2 secondes lors du parcours complet. Une correction dans la même conversation a conservé les critères et remplacé 90 par 95 cm en environ 3,2 secondes. Chaque sauvegarde a requis un nouvel accord local. Le rechargement et la reprise ont restauré les 95 cm sans envoyer de demande ni accepter le consentement IA. La page de gestion a affiché puis supprimé ce profil synthétique.

Trois requêtes POST `/api/chat` ont été émises au total : un premier essai dont le lecteur de corps streaming CDP a échoué malgré une réponse de l’application correcte, puis les deux demandes du parcours complet observées via le DOM. Ce nombre ne représente pas le nombre d’appels au modèle : une requête chat peut en effectuer plusieurs, et leur nombre n’a pas été mesuré. Aucun autre POST n’a été émis et aucune erreur JavaScript n’a été observée.

Le rapport et les captures sans données personnelles réelles de ce scénario fictif sont conservés localement dans `output/profile-live/`. Ils ne contiennent ni clé, en-tête d’autorisation, état signé ou historique brut. Le profil créé pendant le test a été effacé et le navigateur isolé fermé. Ce contrôle ponctuel ne constitue pas une évaluation générale du modèle ; aucun appel live n’est intégré à `npm test`.

## Revue et parcours complet avant fusion

Le 26 octobre 2026, l’utilisateur a validé cette variante et demandé une revue par agents, un parcours Playwright complet et la fusion. La revue suit le skill `code-review`, avec deux agents indépendants et la base figée `dc36c32`.

- **Standards** : une réponse arrivée après modification du brouillon pouvait réafficher l’ancien profil. Une révision du brouillon capturée au départ de la demande invalide maintenant cette offre, même si le brouillon a ensuite été vidé. Verdict après correction : **approve**, aucun blocage restant.
- **Spec** : la réutilisation d’un ancien exemple pouvait perdre sa provenance fictive après une nouvelle réponse. Cette provenance est maintenant conservée jusqu’à l’effacement explicite de la conversation, et visible dans l’offre. Verdict après correction : **approve**, aucun blocage restant.

Les deux défauts ont été reproduits par le nouveau script Playwright avant modification, puis vérifiés corrigés. Les validations finales passent : 174 tests Node, 4 tests Python, format, lint, build et validation d’artefact. L’audit des dépendances de production ne signale aucune vulnérabilité à cette date. Les tests utilisant des serveurs locaux ont été exécutés hors des restrictions de sandbox après reproduction de l’erreur `listen EPERM`.

Le parcours Playwright réel, sur HTTPS et sans interception réseau, a effectué deux messages synthétiques (90 puis 95 cm) et un clic de confirmation, soit trois POST `/api/chat` ; le nombre d’appels internes au modèle n’a pas été mesuré. Il a vérifié dix fiches Accès Libre, leurs inconnues et provenance, puis ouvert une consultation depuis une vraie fiche en conservant l’onglet de recherche. Deux tours de dialogue fictifs saisis au clavier ont permis de vérifier les notes relues et copiées avec accord, la correction et son focus, l’invalidation de la relecture, l’annulation de sortie et l’effacement. Le rechargement, la reprise à 95 cm sans envoi ni consentement automatique, puis la suppression du profil ont réussi.

La correction a ponctuellement affiché « Lieu non vérifié par IGN » ; la confirmation suivante a néanmoins abouti. Aucun cabinet ne confirmait les trois besoins : les trajets et largeurs inconnus sont restés à confirmer, et 27 obstacles connus ont été exclus. Aucune erreur JavaScript ; seul un 404 de favicon déjà présent a été observé. Aucun microphone, audio ou rendez-vous n’a été déclenché. Rapport et captures : `output/profile-merge-journey/`, fichiers locaux ignorés par Git.
