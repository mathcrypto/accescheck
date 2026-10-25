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
