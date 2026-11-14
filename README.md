<div align="center">

# 📄 OpenPDF

**Le studio PDF local-first, modulaire et souverain — alternative moderne et libre à Adobe Acrobat Pro.**

[![Dernière Release](https://img.shields.io/github/v/release/SharkLog76/OpenPDF?label=Derni%C3%A8re%20version&color=0078D6&logo=github)](https://github.com/SharkLog76/OpenPDF/releases/latest)
[![Licence](https://img.shields.io/badge/Licence-GPL--3.0-brightgreen.svg)](LICENSE)
[![Plateforme](https://img.shields.io/badge/Plateforme-Windows%20x64-blue.svg?logo=windows)](https://github.com/SharkLog76/OpenPDF/releases/latest)
[![Confidentialité](https://img.shields.io/badge/Confidentialit%C3%A9-100%25%20Local--First-success.svg)](#-souverainet%C3%A9--confidentialit%C3%A9-100-locale)
[![Tests CI](https://img.shields.io/badge/Tests-47%2F47%20Pass%C3%A9s-brightgreen.svg)](tests/)

[📥 **Télécharger la dernière version (Windows)**](https://github.com/SharkLog76/OpenPDF/releases/latest) • [📜 **Historique des versions & Changelog**](CHANGELOG.md) • [📖 **Documentation Technique**](docs/architecture/index.md)

</div>

---

## 🚀 Présentation

**OpenPDF** est un éditeur, lecteur, convertisseur et signataire de fichiers PDF conçu selon la méthodologie d'ingénierie rigoureuse **REA (Reverse Engineer Anything)**.

Tous les calculs, le rendu graphique vectoriel, les modifications de contenu et le scellement cryptographique des signatures s'exécutent **strictement en local** sur votre machine. Aucun octet de vos documents ne transite jamais par un serveur externe ou un service cloud tiers.

---

## 📥 Téléchargement et Installation

### 1. Téléchargement direct (Recommandé)
Vous pouvez récupérer à tout moment la dernière version stable prête à l'emploi :

👉 **[Télécharger le dernier installeur OpenPDF (Windows x64)](https://github.com/SharkLog76/OpenPDF/releases/latest)**

*L'installeur NSIS standard s'exécute directement dans votre session utilisateur sans nécessiter de droits administrateur.*

### 2. Accès aux anciennes versions
L'ensemble de l'historique des publications, accompagné des explications détaillées de chaque version et des fichiers d'installation archivés, est disponible dans la section dédiée :
👉 **[Consulter toutes les versions et notes de publication](https://github.com/SharkLog76/OpenPDF/releases)**

Le détail chronologique des évolutions est également consigné dans le journal [CHANGELOG.md](CHANGELOG.md).

---

## ✨ Fonctionnalités Principales

| Domaine | Capacités |
| :--- | :--- |
| **📖 Visualisation & Lecture** | Rendu haute définition (PDF.js), défilement ultra-fluide avec cache LRU (12 pages), sélection et surbrillance du texte au curseur, recherche in-document, navigation par miniatures et sommaire hiérarchique (*outlines*). |
| **✏️ Édition de Contenu** | Ajout de blocs de texte (polices, tailles, couleurs, alignements), annotations (surlignage, souligné, barré, formes géométriques, dessin libre, notes) et modification de champs de formulaires interactifs (`AcroForm`). |
| **🛡️ Caviardage & Biffure** | Outil de caviardage opaque garantissant la suppression physique et définitive du texte et des éléments sensibles dans le binaire PDF sauvegardé. |
| **📑 Gestion des Pages** | Mosaïque visuelle d'organisation des pages, réorganisation par glisser-déposer (*Drag & Drop*), rotation horaire/anti-horaire, extraction de pages et fusion sécurisée de multiples PDF. |
| **✍️ Signature Numérique** | **Double mode** : Création de signatures visuelles (tracé à main levée, import d'image de tampon PNG/SVG, calligraphie) et **signature électronique cryptographique PKCS#7 conforme Adobe** (`.pfx` / `.p12`, certificats X.509, calcul de table `/ByteRange` et vérification d'intégrité). |
| **🔄 Conversion Multi-Formats**| Exportation directe vers Microsoft Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`), page Web autonome (`.html`) ou archive ZIP de pages haute résolution (`.png` / `.jpeg`). |
| **🗂️ Espace Multi-Onglets** | Prise en charge simultanée de plusieurs documents, historique déterministe d'annulation/rétablissement (*Undo/Redo*), invite de sauvegarde anti-perte de données et écriture atomique avec staging anti-corruption. |

---

## 🔒 Souveraineté & Confidentialité 100% Locale

1. **Zéro Cloud & Zéro Télémétrie** : Vos contrats, fiches de paie, pièces d'identité et documents confidentiels ne quittent jamais votre disque dur.
2. **Coffre-fort local sécurisé** : Vos tampons et griffes de signature sont stockés dans votre base locale chiffrée (`SignatureVault`).
3. **Protection des clés privées** : Les phrases de passe de vos certificats de signature `.p12` / `.pfx` ne sont jamais écrites sur le disque ni conservées en mémoire au-delà de l'opération de scellement.
4. **Staging Atomique** : Vos fichiers originaux ne sont jamais modifiés en direct ; toute sauvegarde s'effectue via un fichier tampon temporaire suivi d'un remplacement atomique après validation du hachage SHA-256.

---

## 🛠️ Pile Technologique & Architecture

L'application repose sur un couplage haute performance :

- **Backend Natif** : [Tauri v2](https://tauri.app/) (Rust) — légèreté, sécurité de la mémoire, instance unique et accès système borné.
- **Frontend Réactif** : React 19 + TypeScript 5.9 + Vite 7.
- **Moteur de Rendu** : `pdfjs-dist` avec web worker dédié.
- **Moteur de Mutation PDF** : `pdf-lib`.
- **Moteur Cryptographique** : `node-forge` (PKCS#12, X.509, PKCS#7 detached).
- **Moteurs d'Exportation** : `docx`, `fflate`.

Pour une analyse détaillée du fonctionnement interne sans surconsommation de tokens, consultez notre référentiel d'architecture :
- [Index d'Orientation Technique (Zéro-Token)](docs/architecture/index.md)
- [Vue Globale de l'Architecture](docs/architecture/overview.md)
- [Processus Métier de Bout en Bout](docs/architecture/processes-and-workflows.md)
- [Composants UI & Arbre d'État](docs/architecture/ui-components-and-state.md)

---

## 💻 Compilation depuis les Sources

Si vous préférez compiler l'application vous-même :

### Prérequis
- [Node.js](https://nodejs.org/) (version LTS `>= 20.x`)
- [Rust & Cargo](https://rustup.rs/) (version stable)
- Visual Studio Build Tools (avec composant C++)

### Instructions
```powershell
# 1. Cloner le dépôt
git clone https://github.com/SharkLog76/OpenPDF.git
cd OpenPDF

# 2. Installer les dépendances
npm install

# 3. Lancer les tests unitaires
npm run test

# 4. Lancer en mode développement (Desktop Tauri)
npm run tauri:dev

# 5. Compiler l'installeur de production Windows
npm run tauri:build
```
L'installeur NSIS sera généré dans le dossier `src-tauri/target/release/bundle/nsis/`.

---

## ⚖️ Licence

Ce projet est distribué sous licence libre et open source **GNU General Public License v3.0** (GPL-3.0). Consultez le fichier [LICENSE](LICENSE) pour plus d'informations.
