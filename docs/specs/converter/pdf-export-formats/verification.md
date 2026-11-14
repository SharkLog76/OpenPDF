# Verification (`converter/pdf-export-formats`)

## Contrôles exécutés

- **TypeScript** (`npm.cmd run typecheck`) : `tsc --noEmit` terminé avec code de sortie `0`.
- **Tests unitaires Vitest** (`npm.cmd test`) : **6 tests passés** dans `tests/converter-export.test.ts` (sur 8 fichiers / 47 tests au total, 0 échec) :
  - Groupement géométrique des runs texte en titres/paragraphes et grilles tabulaires (`src/domain/converter.ts`), plus génération des avertissements/inconnues d'audit REA.
  - Génération et structure des archives OOXML `.docx` (`word/document.xml`), `.xlsx` (`xl/worksheets/sheet1.xml`, `<t xml:space="preserve">`), `.pptx` (`ppt/slides/slide1.xml`).
  - Export `.csv`, `.html`, `.txt` et archive `.zip` multi-pages d'images (`page-001.png`, etc.) via `fflate`.
- **Build production Vite + Tauri** (`npm.cmd run tauri:build`) : transformation et bundle des modules `docx` et `fflate` sans erreur dans `dist/`.

## Couverture et limites explicites

- Les tests unitaires vérifient le pipeline de conversion à partir d'abstractions de runs texte/images contrôlées ; le rendu raster réel d'un PDF complexe multi-polices via `pdfjs-dist` puis son ouverture dans Microsoft Word / Excel / PowerPoint nécessitent une validation visuelle manuelle sur des PDF réels dans l'application compilée `openpdf.exe`.
- La fidélité reste bornée aux données observables du PDF (texte vectoriel et lignes/colonnes détectées ou rasterisation page par page pour les pages scannées : aucune OCR intégrée).
