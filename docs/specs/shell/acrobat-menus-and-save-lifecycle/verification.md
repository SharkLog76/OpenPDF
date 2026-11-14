# Verification — Menus Acrobat Pro & Sauvegarde (`shell/acrobat-menus-and-save-lifecycle`)

*Date : 2026-11-13 · Runtime : Node.js v26.13.1 / Vitest 3.2.7 (`jsdom`) / TypeScript (`tsc --noEmit`) / Vite 7.3.8*

## Vérifications exécutées

- **`tests/save-lifecycle.test.ts` (6/6 tests passés)** :
  - `deriveNextVersionFilename` : incrément de nommage (`contrat.pdf` -> `contrat_v2.pdf`, `contrat_v2.pdf` -> `contrat_v3.pdf`, `RAPPORT_V9.PDF` -> `RAPPORT_v10.pdf`, `sans_extension` -> `sans_extension_v2.pdf`).
  - `createBlankPdfBytes` : création et relecture via `PDFDocument.load` d'une page vierge A4 (`595.28 x 841.89 pt`).
  - `overwriteOriginalFile` (fail-closed sans handle) : retourne `OverwriteHandleUnavailable` lorsque `handle` est `null`.
  - `overwriteOriginalFile` (refus de permission) : retourne `OverwritePermissionDenied` lorsque `requestPermission` retourne `'denied'` sans appeler `createWritable`.
  - `overwriteOriginalFile` (écriture atomique mockée) : vérifie l'enchaînement `createWritable` -> `write` -> `close` sur un `FileSystemFileHandle` simulé.
  - `overwriteOriginalFile` (échec d'écriture) : retourne `OverwriteFailed` lorsque `writable.write` rejette.
- **`npm.cmd run typecheck` (`tsc --noEmit`)**, **`npm.cmd test` (4 fichiers, 20/20 tests passés)** et **`npm.cmd run build` (`vite build`)** réussis sans erreur.

## Limites de couverture et éléments non vérifiés

- Les boîtes de dialogue natives Chrome/Edge `showOpenFilePicker` / `showSaveFilePicker`, le glisser-déposer système via `DataTransferItem.getAsFileSystemHandle()`, l'interaction réelle avec les menus déroulants et modales dans un navigateur E2E, et le fallback `<a download>` ne sont pas testés contre un vrai navigateur Chromium dans ce jeu de tests unitaires (les handles File System Access sont testés par mock).
