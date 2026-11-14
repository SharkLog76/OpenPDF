# Implementation Plan — Encapsulation Desktop Windows Tauri v2 (`host/tauri-v2-desktop`)

## Architectural approach

Le frontend React/TypeScript et toute la logique métier (`Domain`, `Contracts`, `Providers`, `Application`) restent inchangés dans leurs invariants. L'intégration Tauri v2 vit exclusivement dans la couche externe `Adapters` (`src/adapters/host/tauriBridge.ts`) et le projet hôte Rust minimal `src-tauri/`.

1. **Prérequis système (approuvés par l'utilisateur)** :
   - Rust (`Rustlang.Rustup`, toolchain `stable-x86_64-pc-windows-msvc`) + Visual Studio Build Tools 2022 (`Microsoft.VisualStudio.Workload.VCTools` + Windows SDK).
   - Paquets npm frontend : `@tauri-apps/api`, `@tauri-apps/plugin-dialog` et `@tauri-apps/cli` en `devDependencies`.
2. **Backend Rust (`src-tauri/`)** :
   - Dépendances Cargo : `tauri` v2, `tauri-plugin-dialog`, `serde`, `serde_json`.
   - Module dédié testable (`src-tauri/src/pdf_io.rs`) contenant les primitives pures de lecture bornée (`read_pdf_file_bounded_impl`) et d'écriture atomique (`write_pdf_atomic_impl`), exposées comme commandes Tauri via `src-tauri/src/lib.rs`.
   - Icônes PNG/ICO générées proprement pour le bundle Windows.
3. **Pont TypeScript (`src/adapters/host/tauriBridge.ts`) & intégration `App.tsx` / `boundedFileSystem.ts`** :
   - Ajout de la variante `{ kind: 'tauri-path'; path: string; displayName: string }` à `FileOriginHandle`.
   - Unification dans `App.tsx` : ouverture native (dialogue Tauri ou fichier passé en argument CLI ou drop système Tauri), enregistrement écrasement (`write_pdf_atomic`), enregistrement nouvelle version (`save()` dialog + `write_pdf_atomic`), et synchronisation du titre fenêtre (`setTitle`).
4. **Vérification** :
   - `cargo test` sur les opérations fichiers atomiques et bornées.
   - `npm.cmd run typecheck && npm.cmd test`.
   - `npm.cmd run tauri:build` (bundle Windows `.exe` / `.msi`).
