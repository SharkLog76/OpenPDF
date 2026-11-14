# Verification (`shell/multi-tab-and-close-lifecycle`)

## Contrôles exécutés

- **TypeScript** (`npm.cmd run typecheck`) : `tsc --noEmit` terminé avec code de sortie `0`.
- **Tests unitaires Vitest** (`npm.cmd test`) : **8 fichiers passés, 47 tests passés, 0 échec** :
  - `tests/workspace-tabs.test.ts` (7 tests) : réordonnancement d'onglets, stratégie de fermeture avec avertissement multi-onglets et modifications non enregistrées, géométrie de détachement hors fenêtre, sérialisation/désérialisation sans perte d'état avec `Uint8Array` (ajouts d'images / signatures).
  - `tests/tauri-bridge.test.ts` (11 tests) : formatage des titres OpenPDF et normalisation du bridge hôte.
- **Tests unitaires Rust** (`cargo test --manifest-path src-tauri\Cargo.toml`) : **8 tests passés, 0 échec** dans `openpdf_lib` :
  - `window_manager::tests::clamp_spawn_position_handles_invalid_and_valid_coords` (inclut coordonnées multi-écrans négatives)
  - `window_manager::tests::router_stores_and_consumes_payload_once`
  - `window_manager::tests::sanitize_window_title_strips_controls_and_appends_brand`
  - `default_pdf::tests::formats_open_command_with_quotes`
  - `default_pdf::tests::detects_openpdf_prog_ids_case_insensitively`
- **Correctif deadlock WebView2 multi-fenêtres (v0.1.1)** : passage en commandes `async` + `tauri::async_runtime::spawn_blocking` pour `detach_tab_to_new_window`, `open_path_in_new_window` et `close_window_unconditionally`, complété par un verrou anti-double-détachement (`detachingTabIdsRef`) et un contournement explicite (`bypassCloseInterceptRef`) lors de la fermeture forcée dans `App.tsx`.
- **Build Desktop Tauri v2** (`npm.cmd run tauri:build`) : compilation release v0.1.1 sans erreur (`src-tauri/target/release/openpdf.exe`, `10 695 680` octets).

## Couverture et limites explicites

- Les comportements graphiques interactifs en session Windows réelle (glisser-déposer visuel d'un onglet hors de la fenêtre vers une fenêtre OS dédiée, comportement multi-écrans, dialogue natif de fermeture sur clic croix OS avec plusieurs onglets modifiés, ouverture de l'écran Windows `ms-settings:defaultapps?registeredAppUser=OpenPDF`) relèvent de tests manuels UI sous Windows non exécutables en test unitaire headless.
- L'identifiant IndexedDB `openpdf_vault_v1` dans `signatureVaultStore.ts` garantit le stockage local sécurisé.
