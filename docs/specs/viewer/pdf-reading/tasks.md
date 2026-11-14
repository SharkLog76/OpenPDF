# Tasks — Lecture de PDF (`viewer/pdf-reading`)

- [x] Définir les types domaine `Result<T, E>`, `DocumentIdentity`, `ViewportState`.
- [x] Créer les contrats `ADMISSION_LIMITS` et `validatePdfAdmission`.
- [x] Implémenter l'admission bornée et la validation d'en-tête `%PDF-`.
- [x] Implémenter l'adaptateur `PdfJsDocumentHandle` avec rendu canvas, couche texte, recherche et support mot de passe.
- [x] Implémenter le `DocumentSessionService` avec cache LRU borné et libération de ressources à la fermeture.
- [x] Construire l'UI de lecture (toolbar zoom/rotation/page, panneau miniatures/signets, recherche inline).
- [x] Valider les frontières d'admission et consigner dans `verification.md`.
