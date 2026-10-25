# Vercel et base publique en lecture seule

`npm run build:vercel` crée un instantané SQLite dans `.vercel-data/practices.sqlite`. Il utilise l’importateur existant : métadonnées data.gouv.fr, taille et checksum publiés, validation du CSV et des établissements, activation atomique, puis contrôle de l’intégrité SQLite et relecture du nombre de cabinets. Le build échoue si une étape échoue. Aucune fixture de test ne sert à fabriquer cet instantané.

La Function `api/index.js` ouvre ce fichier en lecture seule et transmet uniquement le binding `DB` au handler existant. Les recherches, preuves, distances et outils MCP utilisent les mêmes stores et règles que l’application. La base ne figure pas dans `public/` et ne contient que des données publiques d’établissements, sans conversation ou profil de patient.

Chaque déploiement régénère l’instantané depuis la source officielle. La production ne synchronise pas les données entre deux déploiements et ne permet pas les imports en ligne. L’adaptateur ne transmet ni `DATA_IMPORT_TOKEN`, ni clé OpenAI ou ElevenLabs ; les imports refusent l’accès et les fonctions payantes restent indisponibles. Les interfaces permettent de sélectionner les critères et d’utiliser les voix de l’appareil.

Le build nécessite Node.js 24, Python 3 et l’accès réseau à data.gouv.fr et static.data.gouv.fr. Le téléchargement de l’export national peut durer plusieurs minutes. En cas d’échec, conserver le déploiement précédent et corriger la synchronisation avant de publier.

Le rechargement automatique et le pont local de consultation restent réservés au développement. Aucun endpoint ni client de développement ne figure dans le worker publié.
