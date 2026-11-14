# Encapsulation Desktop Windows Tauri v2 (`host/tauri-v2-desktop`)

## Outcome and scope

Encapsuler **OpenPDF** en application Desktop Windows native légère via **Tauri v2** (WebView2 système + backend Rust) sans dupliquer ni contourner les couches `Domain`, `Contracts`, `Providers` et `Application`. Offrir un accès disque natif borné, l'écrasement atomique du fichier source par chemin disque, la création de nouvelles versions, l'export multi-formats binaire, la gestion multi-onglets / instance unique / détachement multi-fenêtres, la vérification d'application `.pdf` par défaut sous Windows, et un installateur NSIS utilisateur courant sans élévation de privilèges proposant le choix des raccourcis Bureau et Menu Démarrer.

**ADR liée** : [Stack technique et moteurs PDF](../../../adr/architecture/stack-and-pdf-engine.md)

## Functional contract

1. **Pont hôte hybride Navigateur / Tauri (`src/adapters/host/tauriBridge.ts`)** :
   - Détection pure du runtime Desktop (`isTauriRuntime()`).
   - En mode Desktop Tauri :
     - Ouverture de fichier PDF via dialogue natif (`@tauri-apps/plugin-dialog`) ou glisser-déposer système (`onDragDropEvent`) en conservant la référence `tauri-path` (`{ kind: 'tauri-path', path, displayName }`).
     - Enregistrement **Écraser l'original (`Ctrl+S`)** : écriture atomique sur le chemin d'origine via commande Rust dédiée (`write_pdf_atomic`).
     - Enregistrement **Nouvelle version (`Ctrl+Shift+S` / `Enregistrer sous…`)** : dialogue natif de sauvegarde avec suggestion `*_v2.pdf`, écriture atomique vers le nouveau chemin et bascule de l'origine de session vers ce nouveau chemin.
     - Export multi-formats (`saveExportFileTauri` -> `write_binary_file_atomic`) pour `.docx`, `.xlsx`, `.pptx`, `.csv`, `.png`, `.jpg`, `.zip`, `.html`, `.txt`.
     - Synchronisation multi-onglets / multi-fenêtres : `take_window_launch_payload`, `detach_tab_to_new_window`, `open_path_in_new_window`, écoute d'événements `open-pdf-request` et interception `onCloseRequested`.
   - En mode navigateur Web : conservation intégrale du comportement existant (`fs-handle` / `<input type="file">` / téléchargement).

2. **Commandes Rust bornées et Fail-Closed (`src-tauri/src/`)** :
   - `get_launch_pdf_args()` : inspecte les arguments CLI au démarrage et ne retourne que des chemins `.pdf` existants et lisibles.
   - `read_pdf_file_bounded(path, max_bytes)` : vérifie `metadata().len()` avant allocation RAM (rejet `EmptyFile` ou `FileTooLarge`), puis vérifie l'en-tête `%PDF-`.
   - `write_pdf_atomic(path, bytes)` & `write_binary_file_atomic(path, bytes)` : écriture via fichier temporaire dans le même répertoire parent, `sync_all()`, puis renommage atomique.
   - `tauri-plugin-single-instance` : intercepte le lancement sur un second `.pdf`, focalise la fenêtre active et émet `open-pdf-request`.
   - `window_manager.rs` : transfert mémoire borné `DetachedTabStore` (sans fuite de fichiers temporaires) et création de `WebviewWindow` dédiées.
   - `default_pdf.rs` : inspection lecture seule de `UserChoice` `.pdf`, enregistrement additif sans élévation sous `HKCU` (`OpenPDF.Document` + `RegisteredApplications`) et ouverture guidée des Paramètres Windows (`ms-settings:defaultapps`).

3. **Intégration fenêtre & empaquetage Windows (`src-tauri/installer/openpdf.nsi`)** :
   - Titre dynamique de fenêtre `OpenPDF — <doc> [*]` reflétant l'onglet actif et l'état `isDirty`.
   - Capacités Tauri v2 (`src-tauri/capabilities/default.json`) étendues à `"windows": ["*"]` avec permissions `core:window:allow-set-title`, `allow-set-focus`, `allow-unminimize`, `allow-close`, `allow-destroy`, `core:event:default`, `dialog:allow-open`, `dialog:allow-save`.
   - Installateur NSIS configuré en `installMode: "currentUser"` (`RequestExecutionLevel user` -> installation dans `%LocalAppData%\OpenPDF` sans élévation UAC), localisé en français, avec page personnalisée proposant explicitement les cases à cocher **« Créer une icône sur le Bureau »**, **« Créer une icône dans le Menu Démarrer »** et **« Inscrire OpenPDF pour les fichiers PDF »**. Le bundle `.msi` reste produit en parallèle pour déploiement administrateur poste complet.

## Non-goals

- Remplacement immédiat des moteurs PDF.js / `pdf-lib` par un moteur Rust natif (prévu uniquement en évolution ultérieure derrière l'interface `Providers`).
- Exécution de commandes shell externes arbitraires depuis la WebView.

## Resource admission

- Lecture bornée côté Rust au plafond `ADMISSION_LIMITS.MAX_PDF_BYTES` (`100 Mo` par défaut) avant chargement mémoire.
- Aucune journalisation ni persistance des secrets PKCS#12 ou passphrases côté Rust.

## Verification

- Compilation TypeScript (`tsc --noEmit`) et suite complète Vitest (`vitest run`) incluant des tests unitaires sur le pont `tauriBridge.ts` (mock runtime Tauri vs fallback navigateur).
- Compilation Rust (`cargo check` / `cargo test` dans `src-tauri`) testant `read_pdf_file_bounded` et `write_pdf_atomic` sur fichiers réels temporaires (valide, vide, dépassement de quota, remplacement atomique).
- Build complet Desktop Windows (`tauri build`) générant le binaire et l'installeur Windows dans `src-tauri/target/release/`.
