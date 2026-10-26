# Variante DevDay : ne plus tout réexpliquer

Branche `feature/devday-profile`, page `/profil`. L’utilisateur a explicitement demandé le 26 octobre 2026 de proposer un profil depuis la requête et de le conserver pour une prochaine recherche. Cette variante constitue une exception volontaire et bornée à la règle habituelle de non-persistance des besoins.

## Depuis la recherche habituelle

Après que l’agent a formulé une proposition structurée, le chat offre de garder les critères d’accès. Le patient peut les faire corriger dans sa demande avant de confirmer l’accord de conservation. Seuls les identifiants de critères et une largeur éventuelle sont extraits de la proposition ; l’état signé, le texte de conversation, les lieux et les questions libres ne sont jamais conservés.

Au prochain chargement, « Utiliser mon profil » prépare le champ de recherche avec une description déterministe. Il ne l’envoie pas et ne coche pas le consentement OpenAI. Un message en cours n’est pas écrasé. La profession, le lieu et la confirmation de recherche restent à préciser comme avant.

## Depuis la page du profil

Le patient décrit ses besoins, accepte séparément l’envoi à OpenAI puis clique pour demander une proposition. `/api/profile-extract` réutilise l’agent de besoins existant. Les questions libres du modèle et la demande initiale ne font pas partie du profil. Le patient relit et modifie les critères et la largeur avant un accord distinct de stockage local.

Les contrôles d’édition et de sauvegarde sont désactivés pendant une extraction. Les corrections invalident l’accord de stockage ; aucune nouvelle valeur n’est sauvegardée automatiquement. L’exemple fictif est écrit à l’avance et ne fait aucun appel IA. S’il est enregistré, son marqueur fictif reste conservé et est réintroduit dans la demande de recherche.

## Conservation

Le navigateur conserve un seul objet versionné avec les critères, la largeur, le marqueur fictif et les dates de conservation. Aucun compte, synchronisation entre appareils, stockage serveur, conversation, nom, diagnostic, adresse ou état signé. L’utilisateur peut modifier le profil ou supprimer son enregistrement.

Le profil expire après 30 jours. Il n’est plus réutilisable après cette date et est supprimé à la prochaine lecture/ouverture de l’application : un navigateur fermé ne permet pas d’exécuter une purge en arrière-plan. Les objets corrompus, de durée incohérente ou contenant des champs supplémentaires sont aussi supprimés lors de la lecture. Le refus de stockage par le navigateur est signalé sans bloquer la recherche.

Le profil n’est pas chiffré par l’application. Toute personne utilisant ce même navigateur peut le voir ; la page le signale avant l’accord. La conservation est déconseillée sur un appareil partagé. Les noms et coordonnées visibles dans une demande ne sont pas rendus anonymes par cette fonctionnalité ; l’agent existant rejette les motifs usuels de coordonnées avant envoi, sans promesse d’anonymisation générale.

## Vérification

- `npm run check` : format, lint, tests, build et validation de l’artefact.
- `python3 -m unittest discover -s test -p 'test_*.py'`.
- `scripts/check-profile.mjs` : démonstration sans envoi, stockage explicite et borné, rechargement, reprise sans envoi, conversation non conservée, effacement, corruption, consentements distincts, erreurs de stockage et largeurs 320/390/768/1440.

Les tests utilisent des réponses fournisseur contrôlées. Aucun appel IA payant ni test sur des données de santé réelles n’est exécuté.

## Revue finale

Revue indépendante par un agent non auteur. Parcours complet vérifié aussi sur le lien VPN HTTPS : requête normale contrôlée, consentement local distinct, rechargement, reprise sans envoi et suppression. Le test de conservation détecte une mutation isolée de la limite exacte d’expiration. Aucun appel payant n’a servi à ces vérifications.
