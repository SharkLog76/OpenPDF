# Tasks — Menus Acrobat Pro & Sauvegarde (`shell/acrobat-menus-and-save-lifecycle`)

- [x] Ajouter les erreurs typées `OverwriteHandleUnavailable`, `OverwritePermissionDenied`, `OverwriteFailed` dans `src/contracts/errors.ts`.
- [x] Implémenter `openPdfWithNativePicker`, `extractDropFileHandle`, `overwriteOriginalFile`, `saveAsNewFileVersion`, `deriveNextVersionFilename` et `createBlankPdfBytes` dans `boundedFileSystem.ts`.
- [x] Construire `AcrobatMenuBar.tsx` avec menus déroulants (`Fichier`, `Édition`, `Affichage`, `Outils`, `Fenêtre`, `Aide`), barre d'ateliers et raccourcis clavier (`App.tsx`).
- [x] Construire le volet gauche « Tous les outils » (`LeftSidebar.tsx`) style Acrobat Pro et la modale d'enregistrement (`SaveAndDialogs.tsx` : Écraser vs Nouvelle version, Propriétés, Raccourcis).
- [x] Tester `deriveNextVersionFilename`, `createBlankPdfBytes`, l'écriture atomique sur handle mocké et les cas d'échec dans `tests/save-lifecycle.test.ts`.
