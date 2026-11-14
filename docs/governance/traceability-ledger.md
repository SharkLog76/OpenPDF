# Registre de Traçabilité des Demandes (Traceability Ledger)

Ce registre consigne chronologiquement l'ensemble des demandes utilisateurs exécutées sur le projet **OpenPDF**. Il garantit la traçabilité de chaque évolution, les points de restauration associés et les modalités de réversibilité.

---

## Index des Demandes

| ID Demande | Date | Titre / Objet | Statut | Point de Restauration | Fichiers Impactés |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-20261114-01** | 2026-11-14 | Initialisation Git et push sur dépôt bare NAS | COMPLÉTÉ | Commit initial (`76784e5`) | Dépôt entier |
| **REQ-20261114-02** | 2026-11-14 | Mise en place de la gouvernance projet & documentation d'architecture détaillée | COMPLÉTÉ | `76784e5` | `docs/`, `AGENTS.md` |
| **REQ-20261114-03** | 2026-11-14 | Intégration de la licence GPL-3.0 et synchronisation bi-directionnelle avec GitHub | COMPLÉTÉ | `0b552a9` | `LICENSE`, `package.json`, remotes |
| **REQ-20261114-04** | 2026-11-14 | Professionnalisation du dépôt : README vitrine, Changelog officiel et pipeline Releases GitHub Actions | COMPLÉTÉ | `4645f42` | `README.md`, `CHANGELOG.md`, `.github/workflows/` |
| **REQ-20261114-05** | 2026-11-14 | Présentation visuelle du projet (README vitrine, captures d'écran réelles HD de l'application) | COMPLÉTÉ | `0ebd819` | `README.md`, `docs/assets/screenshots/`, `App.tsx` |
| **REQ-20261114-06** | 2026-11-14 | Intégration de la signature de code SignPath Foundation (CI/CD GitHub Actions) | COMPLÉTÉ | `d31fc0f` | `.github/workflows/release.yml`, `docs/development/code-signing-signpath.md` |
| **REQ-20261114-07** | 2026-11-14 | Audit complet et correction exhaustive des vulnérabilités de sécurité (App, Crypto, Tauri/Rust, Dépendances, CI) | COMPLÉTÉ | `4094831` | `package.json`, `src/`, `src-tauri/`, `.github/workflows/`, `tests/`, `docs/` |
| **REQ-20261114-08** | 2026-11-14 | Refonte haute fidélité du module d'export (Word, PowerPoint, HTML) pour conformité absolue au PDF (mise en page, polices, images) | COMPLÉTÉ | `e2adc2c` | `src/domain/converter.ts`, `src/providers/converter/`, `src/application/converter/`, `src/adapters/ui/components/ExportFormatsModal.tsx`, `tests/`, `.github/workflows/` |
| **REQ-20261114-09** | 2026-11-14 | Système de détection automatique des mises à jour (GitHub Releases), notification in-app, publication release v0.1.2 et mémorisation du cycle de release | COMPLÉTÉ | `d861bbc` | `src/domain/updater.ts`, `src/application/updater/`, `src/adapters/ui/`, `src-tauri/`, `package.json`, `CHANGELOG.md`, `AGENTS.md` |

---

## Détail des Demandes

### REQ-20261114-01 : Initialisation Git et déploiement du dépôt bare NAS
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 04:21
- **Besoin** : Création d'un dépôt Git bare sur le Synology NAS (`/volume2/Developpement/OpenPDF.git`) accessible via SSH (port 5123) et premier push du code local.
- **Périmètre & Fichiers** :
  - NAS : `/volume2/Developpement/OpenPDF.git`
  - Local : Initialisation `main`, exclusion `.gitignore`, liaison `origin ssh://developpement@anoury.synology.me:5123/volume2/Developpement/OpenPDF.git`
- **Point de Restauration / Réversibilité** :
  - Commit SHA : `76784e5` (`feat: initial commit for OpenPDF`)
  - Commande de rollback : Suppression de `origin` en local (`git remote rm origin`) et suppression du dossier bare sur le NAS (`ssh ... rm -rf /volume2/Developpement/OpenPDF.git`).
- **Résultat de Vérification** :
  - `git push -u origin main` réussi.
  - Vérification distante : `HEAD` pointé sur `refs/heads/main` avec le commit `76784e5`.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-02 : Documentation d'architecture détaillée et règles de gestion en mode projet
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 04:26
- **Besoin** :
  1. Produire une documentation d'architecture ultra-détaillée évitant la surconsommation de tokens lors des futures demandes.
  2. Fournir une documentation précise des processus, contrats, flux et composants pour éliminer le besoin de relecture globale du code source.
  3. Définir les règles de gestion en mode projet avec traçabilité systématique et garantie de réversibilité.
- **Périmètre & Fichiers** :
  - `docs/governance/project-rules.md`
  - `docs/governance/traceability-ledger.md`
  - `docs/architecture/index.md`
  - `docs/architecture/overview.md`
  - `docs/architecture/contracts-and-domain.md`
  - `docs/architecture/modules-and-providers.md`
  - `docs/architecture/processes-and-workflows.md`
  - `docs/architecture/ui-components-and-state.md`
  - `AGENTS.md` (mise à jour des règles d'ingénierie et gouvernance)
  - `docs/README.md` (mise à jour des pointeurs)
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `76784e5`
  - Commande de rollback si nécessaire : `git revert HEAD` ou `git checkout 76784e5 -- docs/ AGENTS.md`
- **Résultat de Vérification** :
  - Validation croisée du contenu avec le code source existant.
  - Exécution des tests unitaires (`npm.cmd test`).
  - Validation de la compilation TypeScript (`npx.cmd tsc --noEmit`).
  - Push du commit sur le NAS.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-03 : Intégration de la licence GPL-3.0 et synchronisation bi-directionnelle GitHub
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 04:45
- **Besoin** :
  1. Résoudre le rejet de push sur `https://github.com/SharkLog76/OpenPDF.git` dû au commit initial créé par GitHub.
  2. Intégrer la licence officielle GNU GPL v3.0 dans l'arbre local et mettre à jour `package.json`.
  3. Pousser simultanément sur le dépôt bare du NAS et sur GitHub.
- **Périmètre & Fichiers** :
  - `LICENSE`
  - `package.json`
  - `.git/config` (remotes `origin` et `github`)
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `0b552a9`
  - Commande de rollback si nécessaire : `git reset --hard 0b552a9`
- **Résultat de Vérification** :
  - Fusion sans conflit de `github/main` (commit `59348c5`) avec `main`.
  - Tests unitaires et typecheck vérifiés.
  - Push synchronisé sur le NAS (`origin`) et GitHub (`github`).
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-04 : Professionnalisation du dépôt GitHub (Releases & Changelog)
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 05:16
- **Besoin** :
  1. Permettre aux utilisateurs de télécharger systématiquement la dernière version stable de l'application depuis GitHub.
  2. Fournir un historique public complet des versions avec explicatifs détaillés des évolutions (Changelog / Release Notes).
  3. Mettre en place un pipeline automatisé de publication des releases (GitHub Actions).
  4. Créer un `README.md` vitrine à la racine avec badges, liens de téléchargement directs, aperçu des fonctionnalités et instructions d'installation.
- **Périmètre & Fichiers** :
  - `README.md` (page d'accueil du dépôt GitHub avec badges et liens directs vers `/releases/latest`)
  - `CHANGELOG.md` (journal officiel suivant Keep a Changelog et SemVer)
  - `.github/workflows/release.yml` (pipeline GitHub Actions pour compiler et attacher les installeurs NSIS `.exe` et `.msi` aux releases GitHub)
  - `.github/workflows/ci.yml` (pipeline de validation continue des tests et du typage)
  - `docs/governance/traceability-ledger.md`
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `4645f42`
  - Commande de rollback si nécessaire : `git reset --hard 4645f42`
- **Résultat de Vérification** :
  - Tests unitaires et d'intégration validés (`npm.cmd test`).
  - Validation TypeScript sans erreur (`npm.cmd run typecheck`).
  - Dépôt synchronisé avec le NAS bare repo et GitHub.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-05 : Présentation visuelle de l'outil avec captures d'écran réelles
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 05:27
- **Besoin** :
  1. Offrir aux visiteurs du dépôt GitHub une présentation visuelle attractive et engageante de l'outil plutôt qu'un README textuel austère.
  2. Capturer des screenshots haute résolution (1440x900) illustrant les fonctionnalités phares :
     - Écran d'accueil et hub de démarrage rapide (`01-welcome-hub.png`)
     - Éditeur de documents et formulaires interactifs (`02-editor-document.png`)
     - Grille d'organisation et manipulation de pages (`03-page-organizer.png`)
     - Coffre-fort de signatures et signature cryptographique PKCS#7 (`04-signature-vault.png`)
     - Dialogue d'export et conversion multi-formats (`05-export-formats.png`)
  3. Intégrer ces captures dans le `README.md` avec une visite guidée structurée, un tableau comparatif avec Adobe Acrobat Pro et des boutons d'action clairs.
- **Périmètre & Fichiers** :
  - `README.md` (refonte complète orientée produit et présentation visuelle)
  - `docs/assets/screenshots/` (5 captures d'écran HD réelles)
  - `src/adapters/ui/App.tsx` (support des paramètres d'URL pour le rendu automatisé)
  - `docs/governance/traceability-ledger.md`
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `0ebd819`
  - Commande de rollback si nécessaire : `git reset --hard 0ebd819`
- **Résultat de Vérification** :
  - Screenshots capturés avec succès via Chrome Headless et validés visuellement.
  - Tests unitaires (47/47) et typecheck TypeScript validés sans erreur.
  - Synchronisation avec le dépôt bare NAS et GitHub.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-06 : Intégration de la signature de code SignPath Foundation
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 06:08
- **Besoin** :
  1. Préparer l'infrastructure de signature de code Authenticode gratuite pour projet open source via SignPath Foundation.
  2. Rédiger le guide d'onboarding complet pour la candidature et la configuration SignPath.io (`docs/development/code-signing-signpath.md`).
  3. Mettre à jour le pipeline GitHub Actions (`.github/workflows/release.yml`) pour soumettre automatiquement les installeurs NSIS `.exe` et `.msi` à SignPath, attendre le scellement HSM et publier les binaires signés avec empreintes SHA-256.
  4. Garantir un fallback transparent si les secrets ne sont pas encore renseignés.
- **Périmètre & Fichiers** :
  - `.github/workflows/release.yml`
  - `docs/development/code-signing-signpath.md`
  - `docs/governance/traceability-ledger.md`
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `d31fc0f`
  - Commande de rollback si nécessaire : `git reset --hard d31fc0f`
- **Résultat de Vérification** :
  - Workflow validé avec détection conditionnelle du secret `SIGNPATH_API_TOKEN`.
  - Documentation pas-à-pas fournie.
  - Synchronisation avec le dépôt bare NAS et GitHub.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-07 : Revue complète de sécurité & remédiation multicouche
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 06:35
- **Besoin** : Effectuer une revue exhaustive de l'ensemble de la base de code (dépendances NPM, backend Rust/Tauri, rendu PDF, moteur cryptographique PKCS#7/PKCS#12, stockage chiffré, exportateurs, interface React et workflows CI/CD) et corriger l'intégralité des failles de sécurité identifiées.
- **Périmètre & Fichiers** :
  - `package.json`, `package-lock.json` : mise à jour `pdfjs-dist` (`6.5.438`, correctif `GHSA-hq66-cqwq-w95j`) et `vitest` (`5.1.0`, `0` vulnérabilité `npm audit`).
  - `src-tauri/tauri.conf.json`, `src-tauri/src/pdf_io.rs`, `src-tauri/src/default_pdf.rs`, `src-tauri/src/window_manager.rs` : activation CSP stricte WebView2, élimination TOCTOU & liens symboliques en lecture/écriture, `create_new(true)` staging atomique, liste blanche d'extensions sûres à l'export (`write_binary_file_atomic_impl`), résolution absolue de `%SystemRoot%\explorer.exe`.
  - `src/contracts/errors.ts`, `src/contracts/schemas.ts` : erreur `UnsafeUrl`, `sanitizeSafeLinkUrl`, `sanitizeSvgMarkup` (anti-XXE/XSS/références externes).
  - `src/providers/renderer/pdfJsRenderer.ts` : `enableXfa: false`, `useWorkerFetch: false`, plafonds mémoires `maxImageSize`/`canvasMaxAreaInBytes`/dimension Canvas (anti-OOM), libération des surfaces pixels à l'éviction/dispose.
  - `src/providers/crypto/signatureProvider.ts` : chiffrement PKCS#12 AES-256 + numéro de série CSPRNG 128 bits, recherche `/Contents`/`/ByteRange` depuis EOF, vérificateur `/ByteRange` anti-Shadow Append & Gap Injection, matching certificat via `issuer`/`serial` CMS, multi-algorithmes SHA-256/384/512, neutralisation SVG avant rastérisation, UUID cryptographiques.
  - `src/providers/storage/signatureVaultStore.ts` : AAD `asset.id` AES-GCM, vérification intégrité PNG/SHA-256 post-déchiffrement, fermeture garantie `db.close()` en bloc `finally`.
  - `src/providers/mutator/pdfLibMutator.ts`, `src/application/session/DocumentSession.ts`, `src/domain/workspaceTabs.ts` : blocage URL dangereuses, suppression des surcouches sous biffure (`redact`) + rastérisation destructive des pages biffées (`replacePdfPagesWithRasterPngs`), filtrage anti-prototype pollution JSON (`__proto__`/`constructor`/`prototype`).
  - `src/providers/converter/xlsxExporter.ts`, `src/providers/converter/webAndImageExporter.ts`, `src/application/converter/DocumentExportService.ts` : neutralisation d'injection de formules CSV, balise CSP dans l'export HTML, quota anti-OOM sur les exports raster multi-pages.
  - `src/adapters/ui/App.tsx`, `SignatureVaultPanel.tsx`, `PdfPageCanvas.tsx` : suppression fuite mot de passe en clair dans les notifications UI et suppression mot de passe par défaut, nettoyage mémoire `.fill(0)` P12, révocation `URL.revokeObjectURL`, pré-contrôle `file.size` avant lecture mémoire, validation stricte URLs liens dans le canvas.
  - `.github/workflows/ci.yml`, `.github/workflows/release.yml` : restriction `permissions: contents: read` en CI, suppression de l'exposition globale du secret `SIGNPATH_API_TOKEN` en env workflow.
  - `tests/` & `docs/architecture/contracts-and-domain.md` : ajout des tests de régression sécurité et mise à jour de la documentation d'architecture.
- **Point de Restauration / Réversibilité** :
  - Commit de référence (`BASE_COMMIT`) : `4094831`
  - Commande de rollback si nécessaire : `git reset --hard 4094831` (ou `git revert HEAD`)
- **Résultat de Vérification** :
  - Exécution complète `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd audit`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm.cmd run build` validée.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-08 : Refonte haute fidélité du module d'export (Word, PowerPoint, HTML, Office)
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 06:50
- **Besoin** :
  1. Rendre les exports Word (.docx), PowerPoint (.pptx) et HTML (.html) conformes et strictement IDENTIQUES au document PDF d'origine (géométrie, dimensions des pages, polices, tailles, couleurs, images, arrière-plans et mise en page).
  2. Implémenter le mode "Mise en page exacte & fidélité visuelle" par défaut pour Word (sections avec dimensions exactes en twips, marges nulles, arrière-plan graphique HD plein format et blocs de texte éditables positionnés au millimètre via `framePr`).
  3. Implémenter le mode "Diapositives fidèles & Texte éditable" pour PowerPoint (visuel de diapositive HD + zones de texte éditables superposées à leurs coordonnées exactes avec typographie préservée).
  4. Implémenter le mode "Feuille PDF haute fidélité" pour HTML (dimensions exactes par page, arrière-plan graphique HD, couche de texte sélectionnable positionnée en CSS absolu et feuille de style d'impression `@media print`).
  5. Mettre à jour l'interface `ExportFormatsModal` pour offrir les options de fidélité recommandées par défaut tout en conservant le mode flux continu alternatif.
- **Périmètre & Fichiers** :
  - `src/domain/converter.ts`
  - `src/providers/converter/docxExporter.ts`
  - `src/providers/converter/pptxExporter.ts`
  - `src/providers/converter/webAndImageExporter.ts`
  - `src/application/converter/DocumentExportService.ts`
  - `src/adapters/ui/components/ExportFormatsModal.tsx`
  - `tests/converter-export.test.ts`
  - `docs/architecture/modules-and-providers.md`
- **Point de Restauration / Réversibilité** :
  - Commit de référence (`BASE_COMMIT`) : `e2adc2c`
  - Commande de rollback si nécessaire : `git reset --hard e2adc2c` (ou `git revert HEAD`)
- **Résultat de Vérification** :
  - 8 fichiers de tests et 49 tests automatisés validés (`npm.cmd test`).
  - Validation du typage statique TypeScript (`npm.cmd run typecheck` - 0 erreur).
  - Validation du build de production (`npm.cmd run build` - 5.07s).
  - Nettoyage des alertes d'annotation Node 20 en CI (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`).
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-09 : Détection automatique des mises à jour, notification in-app et chaîne de release v0.1.2
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 07:12
- **Besoin** :
  1. Implémenter un système de détection automatique des nouvelles versions disponibles sur GitHub Releases (`SharkLog76/OpenPDF`).
  2. Proposer une notification / modale in-app permettant à l'utilisateur de consulter les nouveautés et de télécharger/installer la mise à jour en un clic.
  3. Mémoriser dans les règles de gouvernance (`AGENTS.md` et `project-rules.md`) l'obligation de publication de release à chaque évolution substantielle validée.
  4. Préparer et publier la release v0.1.2 avec compilation des nouveaux installeurs Windows.
- **Périmètre & Fichiers** :
  - `src/domain/updater.ts`
  - `src/application/updater/UpdateCheckService.ts`
  - `src/adapters/ui/components/UpdateNotificationModal.tsx`
  - `src/adapters/ui/components/TopBar.tsx`
  - `src/adapters/ui/App.tsx`
  - `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`
  - `package.json`, `CHANGELOG.md`, `AGENTS.md`, `docs/governance/project-rules.md`
  - `tests/updater.test.ts`
- **Point de Restauration / Réversibilité** :
  - Commit de référence (`BASE_COMMIT`) : `d861bbc`
  - Commande de rollback si nécessaire : `git reset --hard d861bbc`
- **Résultat de Vérification** :
  - 9 fichiers de tests et 54 tests validés (`npm.cmd test`).
  - Validation du typage statique TypeScript (`npm.cmd run typecheck` - 0 erreur).
  - Validation des 9 tests natifs Rust (`cargo test --manifest-path src-tauri/Cargo.toml`).
  - Validation du build de production (`npm.cmd run build` - 5.20s).
  - Tag git `v0.1.2` créé et synchronisé sur le NAS (`origin`) et GitHub (`github`).
- **Statut** : **COMPLÉTÉ**
