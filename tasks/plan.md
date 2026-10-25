# Recherche conversationnelle — réalisation validée

Le parcours validé dans CAPABILITY-MAP.md est implémenté dans l’ordre des six branches.
La mise à jour distante 601424b est conservée. Introduction photo et consultation inchangées.

## Contrat d’interface

Un seul champ central et un fil de conversation ; une question et ses choix à la fois.
Helvetica, noir/blanc, astérisque rouge, en-tête translucide, cibles 44 px.
Aucune description dans une URL, un stockage navigateur ou un journal. Accord avant OpenAI.
Résultats accessibles avec inconnus explicites ; correction et effacement annulent les requêtes précédentes.

## Lots et vérification

1. `feature/chat-only-entry` : remplacer les formulaires par le chat, rediriger les anciennes routes. Tests HTTP et navigateur mobile/clavier.
2. `feature/needs-dialogue` : état validé, questions contextuelles, choix/libre/inconnu, IGN confirmé, récapitulatif. Tests de transitions et consentement, repli local et erreurs.
3. `feature/practice-results` : recherche confirmée, critères/sources/inconnus/distance, pagination et correction. Tests du classement et du parcours consultation.
4. `feature/agent-activity` : événements progressifs réellement émis, annulation, reprise, statut accessible et animation réduite. Tests du flux et navigateur.
5. `feature/review-sources` : Responses web_search, identité publique seulement, citations validées et plafond de trois fiches puis à la demande. Tests transport, identité, URLs et erreurs.
6. `feature/review-sentiment` : thèmes sourcés, dédoublonnage, contradictions, insuffisance et départage de réputation. Tests de synthèse et de non-interférence avec accessibilité/proximité.

Chaque lot : tests ciblés d’abord, réalisation par tranches, npm run check + tests Python, revue des cinq axes, push de branche, fusion --no-ff et contrôle CI avant le suivant.
Plan et critères approuvés par la demande utilisateur du 25 octobre 2026.

## Décisions bornées

- Proximité exacte avant réputation ; aucune note globale opaque.
- Avis : trois premières fiches, une requête par fiche, appels web bornés, autres fiches sur action explicite.
- Absence de clé ou échec fournisseur : parcours local conservé, avis indisponibles explicites.
- Synthèse descriptive seulement si au moins trois témoignages distincts et attribuables ; aucune représentativité générale revendiquée.
- Aucun connecteur supplémentaire sans accès déjà configuré ; web_search constitue la source multi-site initiale.

## Sources officielles

- https://developers.openai.com/api/docs/guides/tools-web-search : outil Responses, sources et citations cliquables.
- https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams : lecture progressive et annulation.
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion : animation réduite.

## Risques

Les annuaires publics décrivent surtout des établissements, pas toujours les praticiens individuels.
Les avis accessibles sur le web sont partiels ; aucune absence d’avis ne devient une mauvaise réputation.
Les tests fournisseur emploient des réponses contrôlées ; un appel réel est vérifié seulement si une clé serveur et le budget autorisé sont disponibles.

## Revue — chat-only-entry

Revue indépendante : approuvée après corrections pagination, reprise et rayon temporaire de 5 km.
Tests HTTP rouges puis verts ; mutation du garde de redirection détectée.
107 tests Node, 4 tests Python, format/lint/build/artifact réussis.
Chromium : recherche locale, négation, consultation et effacement sur quatre tailles.

## Revue — needs-dialogue

Revue indépendante approuvée après régressions ajoutées : combiner les besoins, corriger un groupe sans supprimer les autres, inconnus sans filtre présumé, ne pas redemander une communication déjà précisée.
123 tests Node et 4 Python réussis ; mutation du garde de vision inconnue détectée.
Playwright : IGN contrôlé, erreur de largeur, unités, questions inconnues, correction et consentement ; 45 régressions consultation/chat passent. Aucun appel payant utilisé.

Référence ajoutée par l’utilisateur : https://github.com/RomaGab/2026-mistral-llm-x-law-hackathon-in-paris-2 ; reprendre la hiérarchie du champ, les étapes visibles et le signe animé dans les lots résultats/activité, avec les composants AccèsCheck.

## Revue — practice-results

Revue indépendante approuvée : accès avant distance même si un code postal est préféré, établissements identifiés comme tels, provenance/date/inconnus et besoins non documentés visibles.
Liste intégrée dans un historique défilant avec saisie disponible ; réponses QCM visibles comme messages et anciens choix retirés du parcours clavier.
Mutation inversant l’ordre de l’accessibilité détectée.

## Revue — agent-activity

Revue indépendante approuvée après déplacement des statuts fournisseurs au départ effectif du transport, après validation.
Flux NDJSON avec statuts réels, fragments de réponse disponibles et résultat final, sans délai de frappe artificiel.
Décodage UTF-8, absence de résultat final, erreur, annulation réseau et reprise testés ; mutation du contrôle de résultat final détectée.
Playwright mobile : marque SVG partagée, pulsation, réduction de mouvement, saisie visible, arrêt réel d’IGN et reprise.
