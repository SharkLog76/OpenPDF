# Plan — Modification complète de PDF (`editor/pdf-modification`)

1. Étendre `src/domain/editor.ts` avec :
   - `ExistingTextBlock`, `WhiteoutRectItem`, `LinkAnnotationItem`, `WatermarkConfig`, `HeaderFooterConfig`, `PageCropConfig`, `PageBackgroundConfig`, `CreatedFormFieldItem`
   - Algorithme pur `groupTextRunsIntoBlocks()` (regroupement ligne/paragraphe déterministe)
   - Nouvelles variantes `EditCommand` pour édition du contenu existant, mise en page, pages vierges/externes, liens et création de champs AcroForm.
2. Étendre `src/application/ledger/CommandLedger.ts` pour supporter et inverser (Undo/Redo) chaque nouvelle `EditCommand`.
3. Étendre `src/providers/renderer/pdfJsRenderer.ts` avec extraction des blocs de texte + échantillonnage automatique de couleur de fond/texte sur canvas 1x (`extractEditableTextBlocks`).
4. Étendre `src/providers/mutator/pdfLibMutator.ts` (`compileEditedPdf`) pour compiler toutes ces commandes (polices Bold/Italic/Oblique, patchs de couleur de fond des textes existants modifiés/supprimés, whiteout, liens `/Annot /Link`, filigrane, en-tête/pied de page avec `{page}/{total}`, cropBox, background, création de champs AcroForm, pages vierges et pages importées).
5. Enrichir `PdfPageCanvas.tsx` et le panneau droit **Format (Modifier le PDF)** pour éditer en direct n'importe quel texte existant du PDF, dessiner des zones à effacer/liens/champs, et appliquer filigranes/en-têtes/recadrage.
6. Valider par tests automatisés dans `tests/editor-modification.test.ts` et mettre à jour `verification.md`.
