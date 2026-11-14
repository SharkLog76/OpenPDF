# Plan — Menus Acrobat Pro & Sauvegarde (`shell/acrobat-menus-and-save-lifecycle`)

1. Étendre `src/contracts/errors.ts` et `src/providers/filesystem/boundedFileSystem.ts` avec :
   - `FileOriginHandle` (`fs-handle` | `memory` | `sample`)
   - `openPdfWithNativePicker()`, `extractDropFileHandle()`
   - `overwriteOriginalFile(handle, bytes)` et `saveAsNewFileVersion(bytes, suggestedName)`
   - `deriveNextVersionFilename(name)` (ex. `contrat.pdf` $\rightarrow$ `contrat_v2.pdf`, `contrat_v2.pdf` $\rightarrow$ `contrat_v3.pdf`).
2. Créer `src/adapters/ui/components/AcrobatMenuBar.tsx` implémentant la barre de menus déroulants (`Fichier`, `Édition`, `Affichage`, `Outils`, `Fenêtre`, `Aide`), la gestion des raccourcis clavier (`Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+F`, `Ctrl++`, `Ctrl+-`) et la barre d'onglets d'ateliers Acrobat Pro.
3. Créer une modale explicite de sauvegarde (`SaveStrategyModal`) permettant en un clic d'écraser le fichier d'origine (si `FileSystemFileHandle` disponible) ou d'enregistrer une nouvelle version, ainsi qu'une modale `Propriétés du document (Ctrl+D)` et `Raccourcis clavier`.
4. Intégrer l'état `isDirty` (calculé depuis les révisions du `CommandLedger` + placements de signatures non exportés).
5. Ajouter les tests dans `tests/save-lifecycle.test.ts` et consigner dans `verification.md`.
