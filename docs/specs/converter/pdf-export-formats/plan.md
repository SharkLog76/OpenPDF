# Implementation Plan (`converter/pdf-export-formats`)

1. Dépendances : installer `docx` (v9) et `fflate` (ZIP pur ESM/TS sans dépendances Node).
2. Domain (`src/domain/converter.ts`) :
   - Types `ExportFormatId`, `PptxExportMode`, `ExportRequestOptions`, `ConvertedPageData`, `TableGridExtraction`, `ConversionAuditReport`.
   - Fonctions géométriques pures (`buildStructuredPageContent`, `extractTabularRowsAndColumns`, `inferHeadingLevel`).
3. Providers (`src/providers/renderer/pdfJsRenderer.ts` + `src/providers/converter/`) :
   - Étendre `PdfJsDocumentHandle` avec `extractRawPageTextRuns(pageIndex)` et `renderPageToRasterBytes(pageIndex, format, dpi)`.
   - `docxExporter.ts` (OOXML Word via `docx`).
   - `xlsxExporter.ts` (OOXML Excel strict via `fflate` + CSV `;` BOM).
   - `pptxExporter.ts` (OOXML PowerPoint strict via `fflate`, texte positionné EMU + diapos visuelles + notes).
   - `webAndImageExporter.ts` (HTML, TXT, PNG/JPEG simple ou `.zip` multi-pages).
4. Application (`src/application/converter/DocumentExportService.ts`) :
   - Orchestre compilation optionnelle du PDF édité courant, extraction coopérative page par page, invocation du générateur cible, et nettoyage mémoire garanti (`finally { dispose }`).
5. Adapters (`ExportFormatsModal.tsx`, `AcrobatMenuBar.tsx`, `LeftSidebar.tsx`, `tauriBridge.ts`, `src-tauri/src/pdf_io.rs` `write_binary_file_atomic`).
