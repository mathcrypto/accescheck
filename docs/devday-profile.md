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

Les réponses de l’agent sont contrôlées dans les tests. Aucun appel IA payant ni test sur des données de santé réelles n’est exécuté.
