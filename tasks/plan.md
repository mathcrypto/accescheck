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

## Revue — review-sources

Revue indépendante approuvée : entrée publique fermée, provenance d’URLs, rattachement conservateur, périmètres séparés, erreurs/annulation et cache temporaire borné.
Trois premières fiches uniquement sur la première page après accord ; suivantes sur action explicite.
Un appel réel borné a révélé reasoning.effort incompatible avec la configuration gpt-4.1-mini : correction isolée sur fix/model-reasoning-config, revue et fusionnées. Après correction, une vérification réelle a retrouvé 2 sources dont 1 rattachable, pour 12 pages consultées. Ces appels ont précédé la nouvelle instruction de ne plus lancer de tests payants.
Les modifications distantes f89adfe (typographie et résultats séparés du fil) sont préservées.

## Priorité ajoutée — vrai agent de recherche

Après le point sûr du lot review-sources, implémenter `feature/search-agent` avant review-sentiment. Le dialogue actuel est déterministe, avec extraction OpenAI ponctuelle : il ne constitue pas l’agent autonome demandé.

- Un modèle principal capable de raisonner pilote une vraie boucle Responses function_call/function_call_output. Modèle configurable séparément ; aucun modèle rapide supplémentaire par défaut.
- Outils fermés : IGN structuré avec commune/code commune/arrondissement/code postal ; Accès Libre sur critères/rayon confirmés ; preuves/sources d’une fiche ; avis web sur identité publique seulement. Arguments et résultats sont validés côté serveur.
- Préserver les contraintes explicites, corriger le lieu sans conserver des résultats obsolètes, refuser homonymes hors contexte. Aucun quartier arbitraire présumé parisien.
- Consentement avant envoi de la conversation de recherche, aucun stockage de santé/URL/journal, aucun couplage avec le pont fictif de consultation.
- Budget fini par requête (appels modèle/outils, tokens, délai), événements visibles et annulation propagée. Pas d’appels payants de test supplémentaires automatiques.
- Régressions : Lyon 3e/69003/69383, Paris 14e, Marseille 8e, communes ambiguës, correction, mauvais résultats géographiques et sources contradictoires. Playwright sur la demande complète de Lyon ; fournisseur contrôlé pour les parcours agent.
- Le mode local sans accord/fournisseur est étiqueté dégradé. Une extraction rapide éventuelle ne remplace pas la décision géographique de l’agent et nécessite une comparaison coût/latence/qualité.

Sources à vérifier au démarrage : https://developers.openai.com/api/docs/guides/function-calling et https://developers.openai.com/api/docs/guides/model-selection .

## Tranche préalable — fix/structured-geography

L’IGN réel confirme Lyon 3e (69383/69003), Paris 14e (75114/75014) et Marseille 8e (13208/13008). Nouveau module géographique réutilisable par les outils : contexte structuré, codes et identifiants conservés, homonymes filtrés, doublons éliminés, aucune transformation d’un arrondissement en ville entière. Les résultats de cabinets hors code postal d’arrondissement sont exclus même s’ils sont proches.
Les tests hérités supposaient Bastille→Paris et « dans le 14e »→Paris : remplacés par des assertions d’absence de cette supposition, selon la nouvelle demande. La base locale parisienne de 510 fiches a été synchronisée avec l’importateur officiel : 19 750 fiches nationales, contrôles checksum/lecture réussis.
Revue indépendante approuvée après ajout des régressions code postal seul / code commune sans nom de ville. 145 tests Node et 4 tests Python passent. Mutation du garde de contexte administratif détectée.

## Précision utilisateur — retirer les décisions déterministes

Le prochain lot supprime du parcours principal l’arbre de questions, l’extraction par regex et les hypothèses de lieu. Le principal décide réellement des appels, reformulations et précisions. Les validateurs de données/provenance, consentements, bornes et ordre accessibilité→proximité→réputation restent des garde-fous serveur.
Le mode sans IA devient un annuaire dégradé explicitement choisi, sans fausse conversation autonome ni interprétation silencieuse. Adapter les tests de l’ancien arbre aux capacités du nouvel agent, sans perdre la couverture des besoins, des corrections, des sources et des annulations.

### Tranches `feature/search-agent`

1. Contrat et boucle Responses testés avec fournisseur contrôlé : demande complète, historique signé conservé en mémoire, outils stricts, plafond de 7 réponses / 8 outils / 8 000 tokens de sortie / 160 000 octets cumulés envoyés / 55 s. Préparation des critères vérifiables, confirmation explicite puis recherche. Réutiliser IGN, Accès Libre, preuves et avis.
2. Brancher le chat existant : choix de question produits par l’agent, saisie libre/inconnu, consentement au contexte complet, traces d’actions réelles et annuaire public dégradé explicitement choisi. Retirer l’ancien arbre et ses heuristiques de recherche ; conserver les contrôles de données et le pont fictif.
3. Remplacer les anciennes attentes de parcours imposé par les régressions d’agent : géographies Lyon 3e/Paris 14e/Marseille 8e, homonymes, correction, incohérences, consentement, provenance, limites et arrêt. Vérifier le prompt complet dans Chromium avec IGN réel et modèle contrôlé, mobile/clavier/erreurs, sans appel payant.

Modèle principal proposé : `gpt-6.1-sol`, effort medium, configurable par `OPENAI_SEARCH_MODEL` sans changement métier. Documentation officielle consultée : function-calling, model-selection et page modèle. Ce choix répond aux capacités nécessaires ; les simulations ne prouvent pas le coût/la latence réels. Aucun modèle rapide ajouté sans comparaison autorisée. Les plafonds sont par requête ; le budget du compte reste externe.

Vérification search-agent : boucle réelle exécutée avec fournisseur contrôlé, IGN réel pour Lyon 3e et Marseille 8e dans Chromium à 320/390/768/1440 px ; revue indépendante et régressions des corrections de consentement, identité, références héritées et cohérence résultats/récapitulatif. Les contrôles du modèle réel restent non exécutés conformément à la règle sans appels payants supplémentaires.
