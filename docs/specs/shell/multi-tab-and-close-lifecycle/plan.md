# Implementation Plan (`shell/multi-tab-and-close-lifecycle`)

1. Créer les modèles purs de gestion multi-onglets et politiques de fermeture dans `src/adapters/ui/types/workspaceTab.ts` (ou `src/domain/` / `src/application/` selon pureté : les fonctions pures d'ordre d'onglets et d'évaluation de fermeture vivent en logique pure testable sans DOM).
2. Implémenter côté Rust (`src-tauri/src/window_manager.rs`, `default_pdf.rs`, `lib.rs`) :
   - `tauri-plugin-single-instance` émettant `open-pdf-request` ;
   - `DetachedTabStore` & `PendingWindowPathStore` pour le transfert d'onglet en nouvelle fenêtre `WebviewWindowBuilder` ;
   - `check_pdf_default_status` et `register_and_open_default_pdf_settings` sous `HKCU` sans élévation.
3. Mettre à jour `src-tauri/capabilities/default.json` (`"windows": ["*"]`, permissions close/destroy/focus/event).
4. Créer les composants UI :
   - `src/adapters/ui/components/DocumentTabBar.tsx` (glisser pour réordonner + glisser hors fenêtre pour détacher) ;
   - `CloseConfirmModal`, `ExternalOpenChoiceModal`, `DefaultPdfBanner` / modal.
5. Refactoriser `App.tsx` pour gérer un tableau de `WorkspaceTab` avec `activeTabId`, `onCloseRequested` Tauri et `beforeunload` navigateur.
6. Valider `OpenPDF` et `Preuves REA` -> `Empreinte du Fichier`.
