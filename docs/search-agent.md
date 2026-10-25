# Agent de recherche AccèsCheck

Le chat `/api/chat` transmet la demande complète et le contexte en mémoire à la Responses API après accord explicite. `search-contract.mjs` expose cinq fonctions strictes : géocodage IGN structuré, préparation du récapitulatif, recherche Accès Libre confirmée, lecture des preuves et recherche web sur l’identité publique d’une fiche. Le modèle décide des questions et de l’ordre des outils. L’ancien moteur à règles et son arbre de questions ont été supprimés ; `/api/agent` répond 410. Les fonctions historiques MCP/consultation restent compatibles.

`search-agent.mjs` renvoie les sorties des fonctions avec leur `call_id` et conserve les éléments de raisonnement chiffrés dans la boucle courante (`store:false`). Les états affichés correspondent aux outils effectivement démarrés. Aucun raisonnement interne n’est montré. Les fragments de réponse sont affichés après validation de leur structure, sans animation de frappe artificielle. [Function calling](https://developers.openai.com/api/docs/guides/function-calling).

## Contrôles serveur

Les coordonnées proviennent uniquement d’IGN. Une référence signée conserve code commune, code postal, arrondissement et provenance. Les propositions sont préparées avec ces références, les professions du catalogue et des critères validés. Une nouvelle proposition retire les résultats précédents ; le clic de confirmation autorise uniquement la proposition affichée. Les résultats et preuves viennent du snapshot Accès Libre. La signature HMAC utilise une clé dérivée du secret serveur ; elle ne chiffre pas le contexte, qui reste dans la mémoire de l’onglet. Il n’est enregistré ni en URL, ni dans le stockage navigateur, ni dans les journaux. Expiration : une heure ; une nouvelle conversation est nécessaire après 30 messages d’historique ou lorsque la requête dépasse 64 Ko.

Une proposition préparée passe par le bouton serveur « Confirmer et chercher ». Un QCM de confirmation produit par le modèle est remplacé par ce contrôle, sans interpréter une réponse libre comme une autorisation. Après le clic, le modèle doit exécuter cette recherche avant de pouvoir proposer de nouveaux critères à confirmer. Si aucun appel de recherche n’a été exécuté, une erreur avec reprise est affichée plutôt qu’une nouvelle confirmation. Une préparation redondante des mêmes filtres conserve la confirmation et les résultats, même si le modèle reformule ses notes. Une vraie modification des filtres après une recherche retire les anciens résultats et demande une nouvelle confirmation. Une correction écrite par le patient invalide toujours les anciens critères.

Le retrait du consentement suspend les appels et conserve le contexte en mémoire pour une reprise explicite. Sans fournisseur ou sans accord, l’annuaire public est proposé par un bouton ; il ne déduit aucun critère du texte. Une erreur OpenAI reste une erreur visible, avec arrêt/reprise et accès explicite à cet annuaire.

L’enrichissement automatique reste limité aux trois premières fiches de la première page. L’outil d’avis nécessite cet accord distinct et les autres fiches exigent leur bouton dédié. Les résultats de l’agent alimentent le cache de l’onglet pour éviter un second appel par l’interface. La recherche web ne reçoit que l’identité publique lue dans la base. [Web search et citations](https://developers.openai.com/api/docs/guides/tools-web-search).

## Modèle et bornes

Choix utilisateur : `gpt-5.4-mini` pour l’API AccèsCheck, avec effort `medium` pour l’agent principal. Priorité : `OPENAI_SEARCH_MODEL` si explicitement renseigné, puis `OPENAI_MODEL`, puis la valeur par défaut commune `gpt-5.4-mini`. Les exemples reprennent ce choix pour les avis aussi. La configuration de la session Codex reste indépendante. Aucun modèle rapide supplémentaire ni retour automatique à Sol. [Fiche modèle](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [sélection de modèle](https://developers.openai.com/api/docs/guides/model-selection).

Par tour : au plus 7 réponses du modèle, 8 exécutions d’outils, 8 000 tokens de sortie (raisonnement compris), 160 000 octets cumulés de requêtes au modèle et 55 secondes. Chaque réponse est plafonnée à 2 400 tokens et le contexte courant à 120 000 caractères. Au plus un appel à l’outil d’avis, lui-même borné à 35 secondes, 3 500 tokens de sortie et deux appels web, dans le délai global. La pagination d’une recherche confirmée n’appelle pas de modèle. Aucun nouvel essai fournisseur automatique.

Ces limites sont par requête, pas un plafond financier global ni une limitation distribuée par utilisateur. Conserver le budget du projet dans le compte fournisseur. Un modèle de remplacement doit accepter `reasoning.effort:medium`, les fonctions et JSON Schema. Une indisponibilité du modèle est signalée ; aucun remplacement silencieux.

## Vérifications et limites

Les tests de l’exécuteur utilisent des réponses OpenAI contrôlées : lieux Lyon 3e/Paris 14e/Marseille 8e, reformulation après incohérence, références inventées refusées, confirmation, corrections, critères/largeur, QCM libre/inconnu, confidentialité/consentement, erreurs et limites. Les tests IGN couvrent aussi les communes homonymes. Les tests de l’ancien arbre ont été remplacés par ces contrats du nouveau parcours, pas conservés comme une seconde implémentation.

`REAL_IGN=1 node scripts/check-search-agent.mjs` teste le prompt complet de Lyon dans Chromium avec IGN réel et OpenAI contrôlé. Sans cette variable, IGN est contrôlé aussi. Les entrées `check-home-flow`, `check-chat-activity` et `check-geographic-chat` partagent ce parcours. Le choix de modèle est provisoire : ces tests prouvent les contrats et l’exécution des outils, pas la qualité de compréhension du modèle réel, sa disponibilité sur le compte, sa latence ni son coût. Aucun appel payant supplémentaire n’a été lancé pour cette évolution.

Le départage de réputation et la synchronisation de l’ordre affiché avec le contexte sont décrits dans [Avis publics et ressenti](review-reputation.md).
