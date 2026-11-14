# Tasks (`shell/multi-tab-and-close-lifecycle`)

- [x] Renommer le produit, les titres et les identifiants en **OpenPDF** et renommer « Preuves REA » en **« Empreinte du Fichier »**.
- [x] Ajouter `tauri-plugin-single-instance`, `window_manager.rs` et `default_pdf.rs` dans `src-tauri/`.
- [x] Étendre `src/adapters/host/tauriBridge.ts` pour lancement/détachement multi-fenêtres, événements single-instance, `onCloseRequested` et statut PDF par défaut.
- [x] Implémenter `DocumentTabBar.tsx` (réordonnancement par glisser + détachement hors fenêtre).
- [x] Implémenter l'état multi-onglets isolés dans `App.tsx` + modales `ExternalOpenChoiceModal`, `CloseConfirmModal` et bannière d'association PDF par défaut.
- [x] Ajouter et valider les tests unitaires (`tests/workspace-tabs.test.ts`, `tests/tauri-bridge.test.ts`, Rust `window_manager::tests` & `default_pdf::tests`).
