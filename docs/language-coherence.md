# Cohérence des pages et langues

La traduction repose désormais sur [des clés sémantiques i18next et des fichiers JSON FR/EN](i18n.md), avec un rendu localisé dès la réponse initiale et une photo mise en cache séparément.

L’accueil et ses résultats, `/profil` et `/consultation` utilisent le même menu, la même marque et le même favicon. Le profil intégré n’affiche plus de numéro de variante. Les textes de confidentialité distinguent la conversation non conservée des critères enregistrés volontairement sur cet appareil.

Le sélecteur FR/EN est disponible sur les trois pages. Une langue explicite dans l’URL prime sur la préférence mémorisée ; les liens internes anglais la transmettent même si le navigateur refuse le stockage. Changer de langue pendant une consultation contenant des messages ou notes utilise le même avertissement de sortie que les autres liens : annuler conserve le travail, confirmer efface la session.

Les libellés, consentements, dialogues, messages d’erreur usuels, notices d’annuaire et informations du profil sont traduits. Les dates et nombres suivent la langue de l’interface. Une reprise de profil prépare une description dans cette langue, sans envoi ni consentement automatique. Les mots de l’utilisateur, les transcriptions, les notes saisies et les identités de cabinets restent inchangés, y compris leur nom accessible. Seuls les en-têtes synthétiques du brouillon sont traduits.

La reconnaissance vocale reste configurée en français, indépendamment de la langue de l’interface ; les réglages anglais annoncent explicitement le pack français. La traduction de l’interface ne traduit pas les paroles d’un rendez-vous.

## Vérification

- `npm run check` et `python3 -m unittest discover -s test -p 'test_*.py'`.
- `scripts/check-language-coherence.mjs` : trois pages, deux langues, quatre largeurs (320/390/768/1440), profil enregistré et vide, reprise, suppression, dialogues et notes, garde de sortie lors du changement de langue, stockage refusé, annuaire public et ouverture de consultation en nouvel onglet, carte contrôlée avec besoin supplémentaire et libellés accessibles.
- `scripts/check-user-journey.mjs`, `scripts/check-profile.mjs` et `scripts/check-profile-regressions.mjs` : régressions existantes en français.

Le contrôle de traduction utilise des réponses contrôlées pour l’agent et les vraies données de l’annuaire pour la navigation publique. Il ne fait aucun appel IA payant, n’active pas de microphone, ne joue pas d’audio et ne réserve aucun rendez-vous. Rapports et captures : `output/language-coherence/` (ignoré par Git).
