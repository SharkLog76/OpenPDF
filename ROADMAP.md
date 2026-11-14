# OpenPDF Roadmap (REA Structured Workflow)

This roadmap sequences the specifications for **OpenPDF** (a local-first Adobe Acrobat Pro alternative). Per REA conventions ([docs/development/documentation.md](docs/development/documentation.md)), requirements and tasks belong to each child specification; this file tracks order and dependencies only.

## Phase 0 — Cadrage, Stack Lock & Environment Readiness
- Lock technical stack in [docs/adr/architecture/stack-and-pdf-engine.md](docs/adr/architecture/stack-and-pdf-engine.md).
- Verify target runtime toolchain (Node.js LTS / npm or .NET 10 SDK) and test harness.
- Initialize clean modular workspace scaffolding matching [docs/architecture/architecture.mermaid](docs/architecture/architecture.mermaid).

## Phase 1 — Core Domain, Contracts & Bounded Admission
- Implement pure `Domain` types (`Result<T, E>`, `DocumentId`, `PageRef`, `CommandLedger`, `SignatureAsset`) and `Contracts` schemas.
- Implement bounded file admission (`%PDF-` header check, size budgets, SHA-256 identity).

## Phase 2 — MVP Brique 1 : Lecture de PDF (`viewer/pdf-reading`)
- **Spec**: [docs/specs/viewer/pdf-reading/spec.md](docs/specs/viewer/pdf-reading/spec.md)
- **Depends on**: Phase 1
- **Scope**: Virtualized page rendering, zoom/rotation, text selection/search, thumbnail & outline navigation, password/error handling.

## Phase 3 — MVP Brique 2 & Shell Acrobat Pro (`editor/pdf-modification` + `shell/acrobat-menus-and-save-lifecycle`)
- **Specs**: [docs/specs/editor/pdf-modification/spec.md](docs/specs/editor/pdf-modification/spec.md) · [docs/specs/shell/acrobat-menus-and-save-lifecycle/spec.md](docs/specs/shell/acrobat-menus-and-save-lifecycle/spec.md)
- **Depends on**: Phase 2
- **Scope**: Menus et ateliers Adobe Acrobat Pro, sauvegarde avec écrasement du fichier d'origine ou nouvelle version, édition complète du contenu existant (textes existants, gomme/biffure, filigrane, en-tête/pied, recadrage, liens, création AcroForm, pages vierges/fusion/extraction).

## Phase 4 — MVP Brique 3 : Ajout de Fichiers Signatures (`signing/pdf-signature`)
- **Spec**: [docs/specs/signing/pdf-signature/spec.md](docs/specs/signing/pdf-signature/spec.md)
- **Depends on**: Phase 3
- **Scope**: Signature asset vault (PNG/SVG/hand-drawn/stamp + PKCS#12 `.pfx`/`.p12`), interactive placement, visual embedding + cryptographic PKCS#7/PAdES signing and verification.

## Phase 4.5 — Encapsulation Desktop Windows Tauri v2 (`host/tauri-v2-desktop`) & Shell Multi-Onglets
- **Specs**: [docs/specs/host/tauri-v2-desktop/spec.md](docs/specs/host/tauri-v2-desktop/spec.md) · [docs/specs/shell/multi-tab-and-close-lifecycle/spec.md](docs/specs/shell/multi-tab-and-close-lifecycle/spec.md)
- **Depends on**: Phase 4
- **Scope**: Renommage OpenPDF, gestion multi-onglets avec réordonnancement/détachement en nouvelle fenêtre, routage instance unique vs nouvelle instance, invite de sauvegarde et d'avertissement multi-onglets à la fermeture, lecteur `.pdf` par défaut Windows, installateur NSIS utilisateur courant sans élévation avec choix d'icônes Bureau & Menu Démarrer.

## Phase 4.6 — Conversion & Export Multi-Formats (`converter/pdf-export-formats`)
- **Spec**: [docs/specs/converter/pdf-export-formats/spec.md](docs/specs/converter/pdf-export-formats/spec.md)
- **Depends on**: Phase 4.5
- **Scope**: Exportation locale fidèle et auditée REA vers Word (`.docx`), Excel (`.xlsx`/`.csv`), PowerPoint (`.pptx`), Images (`PNG`/`JPEG`/`.zip`), HTML et Texte brut.

## Phase 5 — Post-MVP : Parité Acrobat Pro avancée (À planifier)
- **OCR local** (`ocr/text-recognition`): couche texte invisible sur PDF scannés.
- **Biffure / Redaction irréversible** (`security/pdf-redaction`): suppression définitive d'objets texte/image sous-jacents.
- **Comparaison & Diff de PDF** (`analysis/pdf-diff`): comparaison structurelle et visuelle entre deux versions.
- **Compression & Optimisation** (`optimizer/pdf-compression`): ré-échantillonnage d'images et déduplication d'objets.
- **Archivage PDF/A & Import Office** (`converter/pdfa-and-import`): validation PDF/A et import inverse vers PDF.
