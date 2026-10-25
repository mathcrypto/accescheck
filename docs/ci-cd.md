# Déploiement après un push sur main

Le workflow [Checks](../.github/workflows/checks.yml) vérifie les pushes et les pull requests avec Node.js 24 : installation par `npm ci --ignore-scripts`, tests, compilation et validation de l’artefact.

Après un push sur `main`, le job `deploy-production` attend la réussite de ces contrôles, puis déploie sur **https://accescheck.vercel.app**. Une pull request et un push sur une autre branche exécutent les contrôles sans déploiement.

Le job utilise Vercel CLI **65.2.0** et la séquence [documentée par Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel) : récupération de la configuration de production, compilation de production dans GitHub Actions, puis publication de l’artefact précompilé. Le projet cible porte les identifiants publics `team_rzuudNu04kyY0gpX920s2JKa` et `prj_7kwbByf2dDyZrhV1tCLmtMqAuuLZ`, enregistrés dans le workflow. Aucun jeton ne figure dans le code.

## Activer l’authentification

Une connexion locale à Vercel ne connecte pas GitHub Actions. Une personne ayant accès aux secrets du dépôt doit ajouter un secret Actions nommé `VERCEL_TOKEN` :

1. Créer un jeton sur [Vercel, Account Settings → Tokens](https://vercel.com/account/tokens), avec accès à l’équipe du projet et une date d’expiration.
2. Dans [les secrets Actions du dépôt](https://github.com/mathcrypto/accescheck/settings/secrets/actions), choisir **New repository secret**, saisir `VERCEL_TOKEN` et coller le jeton dans le champ secret.
3. Enregistrer le secret. Ne pas le copier dans le chat, un fichier du dépôt ou une commande conservée dans l’historique du terminal.

Le workflow refuse le déploiement tant que ce secret manque. Son ajout ne lance pas de publication : le prochain push sur `main`, ou la relance d’une exécution correspondant à ce push, déclenchera le job après réussite des contrôles.

La configuration du workflow ne prouve pas que le compte GitHub dispose de l’accès aux secrets du dépôt ni que le secret existe. Une première exécution réussie dans l’onglet Actions validera cette authentification. Les pull requests n’utilisent pas le secret Vercel.

## Périmètre publié

Le déploiement conserve les limites décrites dans le README : recherche publique, préparation de visite et interface de consultation dans le navigateur. Le pont local de consultation et son agent OpenAI restent locaux. Le workflow n’ajoute aucune clé OpenAI ou ElevenLabs et n’injecte aucun client de rechargement de développement dans la production.

Dans l’onglet **Actions**, ouvrir **Checks** pour lire l’échec d’un contrôle ou le résultat du déploiement. Un échec de test, de compilation ou de validation bloque le job de publication et conserve le déploiement précédent.
