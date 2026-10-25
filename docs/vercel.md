# Vercel et base publique en lecture seule

`npm run build:vercel` crée un instantané SQLite dans `.vercel-data/practices.sqlite`. Il utilise l’importateur existant : métadonnées data.gouv.fr, taille et checksum publiés, validation du CSV et des établissements, activation atomique, puis contrôle de l’intégrité SQLite et relecture du nombre de cabinets. Le build échoue si une étape échoue. Aucune fixture de test ne sert à fabriquer cet instantané.

La Function `api/index.js` ouvre ce fichier en lecture seule et transmet le binding `DB` et les variables serveur `OPENAI_API_KEY` / `OPENAI_MODEL` pour le chat avec accord explicite au handler existant. Les recherches, preuves, distances et outils MCP utilisent les mêmes stores et règles que l’application. La base ne figure pas dans `public/` et ne contient que des données publiques d’établissements, sans conversation ou profil de patient.

Chaque déploiement régénère l’instantané depuis la source officielle. La production ne synchronise pas les données entre deux déploiements et ne permet pas les imports en ligne. L’adaptateur ne transmet pas `DATA_IMPORT_TOKEN` ; les imports restent refusés. La lecture vocale utilise Microsoft Edge TTS côté serveur (`/api/speech`), sans clé API. Sans clé OpenAI serveur, le même chat utilise les règles locales. Avec une clé configurée dans Vercel, un message de besoins n’est envoyé qu’après accord explicite. Aucun secret ne figure dans la configuration publique.

Le build nécessite Node.js 24, Python 3 et l’accès réseau à data.gouv.fr et static.data.gouv.fr. Le téléchargement de l’export national peut durer plusieurs minutes. En cas d’échec, conserver le déploiement précédent et corriger la synchronisation avant de publier.

Le rechargement automatique et le pont local de consultation restent réservés au développement. Aucun endpoint ni client de développement ne figure dans le worker publié.

## Avis publics

`/api/reviews` accepte seulement `practiceId` et `consent: true`. Le serveur relit le nom et l’adresse publics dans la base. `OPENAI_REVIEW_MODEL` peut remplacer le modèle d’avis sans changer l’interprétation des besoins. Chaque fiche est bornée à une requête Responses, deux appels web, 3 500 tokens et 35 secondes ; l’annulation coupe le transport. Les trois premières fiches seulement sont enrichies automatiquement après option explicite ; les autres demandent une action.

Les citations proviennent des URLs retournées par l’outil web. Une différence de type (médecin/cabinet), de nom, d’adresse ou une ambiguïté empêche le rattachement des notes et avis. Les sources non attribuées restent signalées. Les résultats et un cache public de 50 fiches maximum vivent uniquement en mémoire de l’onglet, effacés avec la conversation.

Ces bornes limitent une requête, pas la dépense globale d’un service public : le plafond de projet OpenAI reste à configurer sur le compte. Aucun quota distribué ni nouveau service de facturation n’est ajouté. Aucun connecteur d’avis supplémentaire n’est présumé disponible.

Documentation : https://developers.openai.com/api/docs/guides/tools-web-search ; https://zod.dev/json-schema .
