# Tasks (`converter/pdf-export-formats`)

- [x] Ajouter `docx` et `fflate` à `package.json`.
- [x] Créer `src/domain/converter.ts` (analyse géométrique paragraphes/titres et grilles tabulaires).
- [x] Étendre `PdfJsDocumentHandle` (`extractRawPageTextRuns`, `renderPageToRasterBytes`).
- [x] Implémenter `src/providers/converter/{docxExporter,xlsxExporter,pptxExporter,webAndImageExporter}.ts` et `src/application/converter/DocumentExportService.ts`.
- [x] Ajouter `write_binary_file_atomic` côté Rust et `saveExportFileTauri` dans `tauriBridge.ts`.
- [x] Créer `ExportFormatsModal.tsx` et brancher dans `AcrobatMenuBar.tsx`, ruban principal et `App.tsx`.
- [x] Ajouter et exécuter les tests unitaires `tests/converter-export.test.ts` vérifiant les fichiers OOXML/CSV/HTML/TXT/ZIP générés.
