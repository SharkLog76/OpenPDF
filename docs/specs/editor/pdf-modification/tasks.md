# Tasks — Modification complète de PDF (`editor/pdf-modification`)

- [x] Modéliser la conversion de coordonnées Viewport ↔ PDF Points et les types `EditCommand` initiaux.
- [x] Implémenter et tester le `CommandLedger` (Apply, Undo, Redo, invariant dernière page).
- [x] Étendre `domain/editor.ts` et `CommandLedger.ts` pour l'édition des blocs existants, whiteout, filigrane, en-tête/pied, crop, liens, page vierge/externe et création AcroForm.
- [x] Implémenter `extractEditableTextBlocks` avec regroupement déterministe (`groupTextRunsIntoBlocks`) et échantillonnage de couleur dans `pdfJsRenderer.ts`.
- [x] Compiler toutes les nouvelles commandes dans `pdfLibMutator.ts` (y compris pages vierges/externes, CropBox, filigrane, en-têtes/pieds et `/Subtype /Link`).
- [x] Mettre à jour `PdfPageCanvas.tsx` et `FormatInspectorPanel.tsx` / `SignatureVaultPanel.tsx` pour éditer directement tout texte existant.
- [x] Valider par tests round-trip complets dans `tests/editor-modification.test.ts` et mettre à jour `verification.md`.
