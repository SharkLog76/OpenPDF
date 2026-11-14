# Verification — Modification complète de PDF (`editor/pdf-modification`)

*Date : 2026-11-13 · Runtime : Node.js v26.13.1 / Vitest 3.2.7 (`jsdom`) / TypeScript (`tsc --noEmit`) / Vite 7.3.8*

## Vérifications exécutées

- **`tests/editor-modification.test.ts` (6/6 tests passés)** :
  - `CommandLedger` : cycle complet `Apply -> Undo -> Redo` et blocage strict `CannotDeleteLastPage` lors de la tentative de suppression de l'unique page restante, puis restauration par `Undo`.
  - Round-trip initial (`compileEditedPdf`) : ajout de texte, surlignage, modification de champ `AcroForm`, rotation de page (90°) et suppression de page (3 -> 2 pages) -> réouverture valide confirmant 2 pages, rotation 90° et valeur de formulaire `Alexandre M. (Validé)`.
  - Fusion de deux PDF (`mergePdfDocuments` : 3 + 3 = 6 pages) et extraction de plage (`extractPdfPageRange` `"1-2, 6"` -> 3 pages), plus rejet `InvalidPageRange`.
  - Regroupement géométrique pur (`groupTextRunsIntoBlocks`) fusionnant des runs proches sur la même ligne et séparant des paragraphes distincts avec préservation `bold` / `fontFamily`.
  - Édition complète & round-trip avancé (`compileEditedPdf`) : `UPSERT_EXISTING_TEXT_EDIT` (avec `Undo`/`Redo`), `ADD_WHITEOUT`, `ADD_LINK`, `CREATE_FORM_FIELD` (`custom_iban_field` vérifié via `inspectAcroFormFields`), `SET_WATERMARK`, `SET_HEADER_FOOTER`, `SET_PAGE_CROP` (vérification géométrique `CropBox` réduit sur la page compilée), `SET_PAGE_BACKGROUND` et `INSERT_BLANK_PAGE` (3 -> 4 pages).
  - Insertion ciblée de PDF externe (`insertPdfPagesAtIndex`) : insertion d'une page vierge A4 dans un PDF 3 pages -> 4 pages valides.
- **Suite DOM/UI `tests/ui-interactions.test.tsx` (3/3 tests passés)** :
  - Clic sans glissement (`< 4px`) sur un bloc `.existing-text-box` dans `PdfPageCanvas` (`activeTool="edit-pdf"`) : vérifie que la couche `.interactive-layer` ne bloque pas l'édition, que la `<textarea>` inline s'ouvre immédiatement et que la saisie met à jour `currentText`.
  - Contrôles zoom d'`AcrobatMenuBar` (`onChangeZoom(nextZoom)` sans cumul erroné) et interception `wheel` (`{ passive: false }`, `Ctrl+Molette`) + raccourcis clavier (`Ctrl+Minus`, `Ctrl+Equal`) empêchant le zoom du navigateur (`defaultPrevented === true`).
- **Suite complète `npm.cmd test` (5 fichiers, 23/23 tests passés)** et **`npm.cmd run build` (`tsc --noEmit && vite build`)** sans erreur.

## Limites de couverture et éléments non vérifiés

- Les interactions souris/pointer réelles sous Chromium/Tauri (rendu `pdfjs-dist` complet sur Canvas, conversion SVG/WebP vers PNG via `Image` et comportement visuel du défilement à fort zoom) restent à valider manuellement dans le navigateur ; sous `jsdom`, `DOMMatrix` est stubé et le renderer est mocké dans `tests/ui-interactions.test.tsx`.
- Le remplacement visuel du texte PDF existant repose sur un patch de couleur unie sur `originalRect` + réécriture via polices PDF standard (`Helvetica`, `TimesRoman`, `Courier`) et non sur une réécriture binaire de polices personnalisées embarquées en sous-ensemble (`ToUnicode`).
