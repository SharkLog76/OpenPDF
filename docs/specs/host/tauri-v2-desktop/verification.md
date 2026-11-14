# Verification (`host/tauri-v2-desktop`)

## Contrôles exécutés

- **TypeScript** (`npm.cmd run typecheck`) : `tsc --noEmit` terminé avec code de sortie `0`.
- **Tests unitaires Vitest** (`npm.cmd test`) : **8 fichiers passés, 47 tests passés, 0 échec** (dont `tests/tauri-bridge.test.ts` avec 11 tests).
- **Tests unitaires Rust** (`cargo test --manifest-path src-tauri\Cargo.toml`) : **8 tests passés, 0 échec** (`pdf_io::tests` : 3, `window_manager::tests` : 3, `default_pdf::tests` : 2).
- **Build Windows Tauri v2** (`npm.cmd run tauri:build`) : terminé avec code de sortie `0` après compilation frontend Vite + Rust release (`0.1.1`) :
  - Exécutable principal : `src-tauri\target\release\openpdf.exe` (10 695 680 octets)
  - Installeur NSIS utilisateur courant avec mise à jour : `src-tauri\target\release\bundle\nsis\OpenPDF_0.1.1_x64-setup.exe` (2 979 144 octets / 2,84 MiB)
  - Package MSI : `src-tauri\target\release\bundle\msi\OpenPDF_0.1.1_x64_en-US.msi` (4 046 848 octets / 3,86 MiB)
- **Inspection du script NSIS généré** (`src-tauri\target\release\nsis\x64\installer.nsi`) :
  - `!define VERSION "0.1.1"`, `!define INSTALLMODE "currentUser"`, `RequestExecutionLevel user` et `StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"` (`%LocalAppData%\OpenPDF`).
  - Mise à jour sur place (`InPlaceUpdateMode` dans `PageReinstall` / `PageLeaveReinstall`) présélectionnée lors d'une montée de version ou réinstallation, avec `PreDirectoryPage` conservant automatiquement le dossier existant, puis `PageOpenPdfOptions` pré-rempli depuis `ShortcutDesktop`, `ShortcutStartMenu` et `RegisterPdfAssoc` dans `HKCU\Software\OpenPDF\OpenPDF`.

## Couverture et limites explicites

- L'exécution interactive de `OpenPDF_0.1.1_x64-setup.exe` sur une installation `0.1.0` existante, le test visuel du détachement d'un onglet vers une nouvelle fenêtre WebView2 sous Windows 10/11, la fermeture via croix OS après détachement, le double-clic d'un second PDF depuis l'Explorateur, et la configuration Windows `ms-settings:defaultapps?registeredAppUser=OpenPDF` restent à valider manuellement en session graphique Windows réelle.
- L'installeur `.msi` WiX (`OpenPDF_0.1.1_x64_en-US.msi`) reste généré en parallèle de l'installeur NSIS utilisateur courant.
