# Index d'Orientation Technique & Navigation Zéro-Token

Ce document est la **porte d'entrée unique** pour naviguer dans le projet **OpenPDF** sans scanner inutilement l'arborescence ni relire des fichiers entiers. 

> [!TIP]
> **Règle d'or d'économie de tokens** : Identifiez votre besoin dans la matrice ci-dessous, ouvrez directement le document d'architecture détaillé correspondant ou ciblez la plage de lignes exacte du code source avec `read_file`.

---

## 1. Matrice de Routage par Intention Utilisateur

| Intention / Sujet de la Demande | Document d'Architecture Référent | Fichiers Sources Principaux |
| :--- | :--- | :--- |
| **Ajout/Modif d'un outil d'édition (texte, surlignage, forme, biffure)** | [processes-and-workflows.md](processes-and-workflows.md#processus-3--édition-de-contenu-et-gestion-de-lhistorique)<br/>[contracts-and-domain.md](contracts-and-domain.md#domaine-édition-srcdomaineditorts) | [src/domain/editor.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/domain/editor.ts)<br/>[src/providers/mutator/pdfLibMutator.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/providers/mutator/pdfLibMutator.ts)<br/>[src/adapters/ui/components/PdfPageCanvas.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/PdfPageCanvas.tsx) |
| **Signature électronique PKCS#7, Certificats PFX/P12, Coffre-fort** | [processes-and-workflows.md](processes-and-workflows.md#processus-5--signature-électronique-et-coffre-fort)<br/>[modules-and-providers.md](modules-and-providers.md#provider-cryptosignature-srcproviderscryptosignatureproviderts) | [src/domain/signing.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/domain/signing.ts)<br/>[src/providers/crypto/signatureProvider.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/providers/crypto/signatureProvider.ts)<br/>[src/providers/storage/signatureVaultStore.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/providers/storage/signatureVaultStore.ts)<br/>[src/adapters/ui/components/SignatureVaultPanel.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/SignatureVaultPanel.tsx) |
| **Conversion & Export multi-formats (Word, PPT, Excel, Images, HTML)** | [processes-and-workflows.md](processes-and-workflows.md#processus-7--conversion-et-export-multi-formats)<br/>[modules-and-providers.md](modules-and-providers.md#services-de-conversion-srcapplicationconverter-et-srcprovidersconverter) | [src/domain/converter.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/domain/converter.ts)<br/>[src/application/converter/DocumentExportService.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/application/converter/DocumentExportService.ts)<br/>[src/providers/converter/](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/providers/converter/) |
| **Multi-onglets, cycle de fermeture, détection non-sauvegardé** | [processes-and-workflows.md](processes-and-workflows.md#processus-8--gestion-multi-onglets-et-fermeture)<br/>[contracts-and-domain.md](contracts-and-domain.md#domaine-onglets-srcdomainworkspacetabsts) | [src/domain/workspaceTabs.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/domain/workspaceTabs.ts)<br/>[src/adapters/ui/components/DocumentTabBar.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/DocumentTabBar.tsx)<br/>[src/adapters/ui/App.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/App.tsx) |
| **Sauvegarde directe / Sauvegarde sous / Staging atomique** | [processes-and-workflows.md](processes-and-workflows.md#processus-6--sauvegarde-atomique-et-écrasement-sécurisé)<br/>[modules-and-providers.md](modules-and-providers.md#provider-filesystem-srcprovidersfilesystemboundedfilesystemts) | [src/adapters/ui/components/SaveAndDialogs.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/SaveAndDialogs.tsx)<br/>[src/providers/filesystem/boundedFileSystem.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/providers/filesystem/boundedFileSystem.ts)<br/>[src-tauri/src/pdf_io.rs](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src-tauri/src/pdf_io.rs) |
| **Gestion des pages (rotation, réorganisation, suppression, fusion)** | [processes-and-workflows.md](processes-and-workflows.md#processus-4--réorganisation-et-gestion-des-pages) | [src/adapters/ui/components/PageOrganizerGrid.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/PageOrganizerGrid.tsx)<br/>[src/providers/mutator/pdfLibMutator.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/providers/mutator/pdfLibMutator.ts) |
| **Rendu visuel du PDF, zoom, mise en cache des bitmaps** | [processes-and-workflows.md](processes-and-workflows.md#processus-2--rendu-des-pages-et-virtualisation-du-viewport)<br/>[modules-and-providers.md](modules-and-providers.md#provider-renderer-srcprovidersrendererpdfjsrendererts) | [src/providers/renderer/pdfJsRenderer.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/providers/renderer/pdfJsRenderer.ts)<br/>[src/adapters/ui/components/PdfPageCanvas.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/PdfPageCanvas.tsx) |
| **Bridge Desktop Tauri (IPC Rust, fenêtres uniques, arguments CLI)** | [modules-and-providers.md](modules-and-providers.md#bridge-desktop-tauri-et-backend-rust) | [src/adapters/host/tauriBridge.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/host/tauriBridge.ts)<br/>[src-tauri/src/lib.rs](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src-tauri/src/lib.rs)<br/>[src-tauri/src/pdf_io.rs](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src-tauri/src/pdf_io.rs) |
| **Gestion des erreurs et codes d'admission (budgets mémoire, magic bytes)** | [contracts-and-domain.md](contracts-and-domain.md#couche-contrats-srccontracts) | [src/contracts/schemas.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/contracts/schemas.ts)<br/>[src/contracts/errors.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/contracts/errors.ts) |
| **Barres d'outils, menus style Acrobat, panneaux latéraux** | [ui-components-and-state.md](ui-components-and-state.md) | [src/adapters/ui/components/AcrobatMenuBar.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/AcrobatMenuBar.tsx)<br/>[src/adapters/ui/components/LeftSidebar.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/LeftSidebar.tsx)<br/>[src/adapters/ui/components/FormatInspectorPanel.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/src/adapters/ui/components/FormatInspectorPanel.tsx) |

---

## 2. Structure Canonique de la Documentation

Le dossier `docs/architecture/` contient les piliers suivants :

1. [overview.md](overview.md) : **Vue globale du système** — Philosophie locale, pile technologique, architecture en couches concentriques, règles de dépendances.
2. [contracts-and-domain.md](contracts-and-domain.md) : **Contrats & Domaine** — Budgets d'admission, validation des magic bytes, algèbre d'erreurs `DomainError`, structure des modèles métier purs, conversions de coordonnées (Points PDF vs UI normalisée).
3. [modules-and-providers.md](modules-and-providers.md) : **Modules & Fournisseurs Techniques** — Spécification détaillée des Providers (`pdfJsRenderer`, `pdfLibMutator`, `signatureProvider`, `boundedFileSystem`, convertisseurs) et services applicatifs (`DocumentSession`, `CommandLedger`).
4. [processes-and-workflows.md](processes-and-workflows.md) : **Processus Métier de Bout en Bout** — Algorithmes étape par étape de chaque workflow (ouverture, édition, signature, export, sauvegarde atomique, multi-onglets).
5. [ui-components-and-state.md](ui-components-and-state.md) : **Composants UI & Arbre d'État** — Architecture de l'interface graphique (React 19), décomposition d'`App.tsx`, gestion d'état centralisée et communication inter-composants.

---

## 3. Emplacement des Tests Associés

| Domaine Testé | Fichier de Test |
| :--- | :--- |
| Lecture, admission et faits PDF | [tests/viewer-reading.test.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/viewer-reading.test.ts) |
| Édition, commandes et ledger | [tests/editor-modification.test.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/editor-modification.test.ts) |
| Signature PKCS#7 et certificats | [tests/signing-pkcs7.test.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/signing-pkcs7.test.ts) |
| Export DOCX / PPTX / XLSX / Web | [tests/converter-export.test.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/converter-export.test.ts) |
| Cycle de sauvegarde et staging | [tests/save-lifecycle.test.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/save-lifecycle.test.ts) |
| Gestion multi-onglets | [tests/workspace-tabs.test.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/workspace-tabs.test.ts) |
| Bridge Tauri & IPC natif | [tests/tauri-bridge.test.ts](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/tauri-bridge.test.ts) |
| Intéractions UI et menus | [tests/ui-interactions.test.tsx](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/tests/ui-interactions.test.tsx) |
