# Stack technique et moteurs PDF pour OpenPDF

## Status

Accepted (Validé par l'utilisateur le 2026-11-13)

Décisions verrouillées :
- **Q1 (Stack)** : Option A — React + TypeScript + Vite (architecture prête pour encapsulation Desktop **Tauri v2**). Installation de Node.js LTS approuvée.
- **Q2 (Signatures)** : Option C — Signatures visuelles (`.png`, `.svg`, `.jpg`, `.webp`, tracé manuscrit, tampon) **et** signature électronique cryptographique via certificats `.pfx` / `.p12` (PKCS#7 `/ByteRange`).
- **Q3 (Persistance locale)** : Coffre local `SignatureVault` chiffré (AES-GCM via WebCrypto dans `IndexedDB`) pour réutiliser les fichiers signatures entre documents sans persister les phrases secrètes `.p12`.
- **Q4 (Ergonomie UI)** : Interface inspirée d'Adobe Acrobat Pro moderne (barre supérieure, panneau gauche miniatures/signets/recherche/formulaires, zone centrale interactive, panneau droit signatures/inspecteur REA, thème Sombre/Clair).

## Context

OpenPDF vise à recréer les capacités complètes d'Adobe Acrobat Pro en démarrant par un MVP en 3 briques :
1. Lecture de PDF haute fidélité (rendu, zoom, recherche, signets, miniatures).
2. Modification structurelle et visuelle (texte, annotations, images, formulaires, manipulation de pages, sauvegarde atomique).
3. Ajout de fichiers signatures (signatures visuelles PNG/SVG/tracé + signature cryptographique via certificats `.pfx`/`.p12` PKCS#7).

L'inspection de l'environnement local Windows (`c:\Users\Alexandre\Desktop\Developpements\OpenPDF`) montre :
- `git` `2.56.1.windows.1` présent.
- `.NET SDK` `10.0.115` / `10.0.404` présent.
- `C:\Program Files\Adobe\Acrobat DC` présent sur le poste (référence locale analysable via REA si nécessaire).
- `Node.js` et `npm` absents du `PATH` actuel.

Trois architectures répondent au cahier des charges tout en respectant le flux de dépendances entrant de REA (`Domain ← Contracts ← Providers ← Application ← Adapters`) :

| Critère | Option A : Hybride Desktop/Web TypeScript (Recommandée REA) | Option B : Web Local-First PWA pur | Option C : Desktop Natif Windows .NET 10 |
| :--- | :--- | :--- | :--- |
| **UI & Langage** | React 19 + TypeScript + Vite + Tailwind + encapsulation Desktop **Tauri v2** (ou Electron) | React 19 + TypeScript + Vite (navigateur uniquement, File System Access API) | C# / .NET 10 + Avalonia UI ou WPF |
| **Moteur Lecture (Renderer)** | `pdfjs-dist` (PDF.js Mozilla, rendu Canvas/SVG + couche texte fidèle) | `pdfjs-dist` | `PDFium` (`PdfiumViewer` / `Docnet`) |
| **Moteur Modification (Mutator)** | `pdf-lib` (manipulation pure d'objets PDF, pages, AcroForm, polices) | `pdf-lib` | `PdfSharpCore` ou `iText` / `PDFium` |
| **Moteur Signature** | Normalisation Canvas/SVG + `node-forge` / `@signpdf` (PKCS#7/PAdES) + WebCrypto | Identique, avec stockage `IndexedDB` | `System.Security.Cryptography.Pkcs` + `iText` / `PdfSharp` |
| **Parité Acrobat Pro (Post-MVP)** | Écosystème massif (Tesseract.js OCR, diff canvas, workers WebAssembly, Tauri Rust pour perf native) | Limitée par le sandbox navigateur (taille fichiers, accès disque, pas de CLI natif) | Excellente perf Windows, mais UI PDF riche plus verbeuse à maintenir |
| **Prérequis local** | Installation de Node.js LTS (`>=22.23.4` / `24.x`) (+ Rust si Tauri v2) | Installation de Node.js LTS (`>=22.23.4` / `24.x`) | Zéro installation (`.NET 10` déjà installé) |

## Decision

**Recommandation REA : Option A (React 19 + TypeScript + Vite, architecture modulaire prête pour Desktop Tauri v2, avec cœur `pdfjs-dist` + `pdf-lib` + `node-forge`/`@signpdf`)**, en démarrant le MVP en mode application locale Vite (utilisable immédiatement dans le navigateur ET encapsulable en `.exe` natif Tauri v2 sans réécrire le `Domain`, les `Contracts` ou l'`Application`).

Justifications alignées sur REA :
1. **Séparation stricte des frontières** : TypeScript + schémas typés (ex. Zod) permet de modéliser l'algèbre d'erreurs `Result<T, E>` et les `Contracts` exactement comme dans le dépôt REA de référence.
2. **Double moteur lecture/écriture éprouvé** : `pdfjs-dist` est la référence open-source pour le rendu fidèle des PDF complexes, tandis que `pdf-lib` excelle pour la mutation incrémentale et la manipulation d'arbres de pages. Les deux sont encapsulés derrière des interfaces `Providers` dédiées, permettant à terme de substituer un moteur natif (ex. `PDFium` via Rust/Tauri) sans toucher à l'`Application`.
3. **Compatibilité directe avec l'écosystème REA** : Permet d'exécuter `npx rea-agents` pour auditer/inspirer des workflows JS/Desktop une fois Node.js LTS installé.

*(Alternative immédiatement disponible sans installer Node.js : **Option C (.NET 10 + Avalonia/WPF)** si l'utilisateur souhaite une application Windows exclusivement native utilisant le SDK `.NET 10` déjà présent.)*

## Consequences

- **Positives** :
  - UI riche type Acrobat Pro (panneaux miniatures, barre d'outils contextuelle, calques d'annotation et signature fluide) rapide à itérer.
  - Zéro dépendance serveur : 100 % des PDF et fichiers signatures restent locaux.
  - Évolutivité naturelle vers un binaire Windows `.exe` léger via Tauri v2 en Phase 5.
- **Contraintes / Prérequis** :
  - Nécessite l'approbation de l'utilisateur pour installer **Node.js LTS** (`winget install OpenJS.NodeJS.LTS` ou installeur officiel) avant la Phase 1.
  - Nécessite une discipline stricte d'admission mémoire (`pdfjs-dist` + `pdf-lib` chargent des structures en RAM ; les budgets d'octets et la virtualisation de pages sont obligatoires dès le MVP).
