# Vue Globale de l'Architecture — OpenPDF

## 1. Vision et Positionnement Produit

**OpenPDF** est un éditeur, lecteur et signataire de fichiers PDF **100 % local** (local-first), conçu comme une alternative modulaire, performante et souveraine à *Adobe Acrobat Pro*.

Toutes les opérations d'inspection de documents, de rendu vectoriel/bitmap, de manipulation structurelle (fusion, extraction, rotation, suppression), de modification de texte, d'annotations et de signature cryptographique s'exécutent **strictement en local** sur la machine de l'utilisateur, sans aucun appel vers un service cloud ou distant.

---

## 2. Pile Technologique

Le projet repose sur un couplage haute performance entre un runtime natif Rust (Tauri v2) et un front-end réactif moderne (React 19 / TypeScript / Vite) :

| Composant | Technologie | Version | Rôle & Responsabilité |
| :--- | :--- | :--- | :--- |
| **Hôte Natif Desktop** | **Tauri v2** (Rust) | `^2.12.4` | Instance unique de l'application (`single-instance`), gestion des fenêtres natives, accès système sécurisé (boîtes de dialogue, lecture/écriture bornée et atomique). |
| **Moteur Front-End** | **React / React-DOM** | `^19.1.1` | Interface utilisateur déclarative, réactive, gestion d'état documentaire et composants modulaires. |
| **Langage & Typage** | **TypeScript** | `^5.9.2` | Typage statique strict, algèbre d'erreurs typées (`Result<T, E>`), absence de types `any`. |
| **Bundler & Outillage** | **Vite** | `^7.1.3` | Compilation ultra-rapide (HMR), packaging d'assets, support des web workers pour PDF.js. |
| **Moteur de Rendu PDF** | **pdfjs-dist** | `^5.3.93` | Parsing bas niveau, extraction d'outlines/métadonnées, rendu bitmap sur Canvas HTML5 avec mise en cache. |
| **Moteur de Mutation PDF**| **pdf-lib** | `^1.17.1` | Modification structurelle du PDF : réorganisation de pages, ajout d'annotations, biffures, formulaires, sérialisation. |
| **Moteur Cryptographique**| **node-forge** | `^1.3.1` | Décodage des conteneurs PKCS#12 (`.pfx` / `.p12`), validation X.509, génération de signatures PKCS#7 détachées (`Adobe.PPKLite`). |
| **Convertisseurs de Formats**| **docx**, **fflate** | `^9.15.3`, `^0.8.3`| Génération de documents Office OpenXML (Word `.docx`, PowerPoint `.pptx`, Excel `.xlsx`) et archivage ZIP. |
| **Framework de Tests** | **Vitest** + **jsdom** | `^3.2.4`, `^27.0.0` | Exécution des tests unitaires et d'intégration côté Node / frontend simulé. |

---

## 3. Architecture en Couches Concentriques

L'architecture respecte strictement le principe d'**inversion de dépendance** (Clean Architecture / Hexagonale) :

```text
[ Adapters (UI Shell, Tauri Bridge, File Dialogs) ]
                    ↓
[ Application (Session, Command Ledger, Export Service) ]
                    ↓
[ Contracts (Schémas typés, Limites d'admission, Catalogue d'erreurs) ]
                    ↓
[ Providers (Moteurs spécialisés : PDF.js, pdf-lib, node-forge, FileSystem) ]
                    ↓
[ Domain (Modèles purs, Arbre de pages, Commandes, Result<T, E>) ]
```

### Règle d'or des dépendances :
- Les dépendances pointent **exclusivement vers l'intérieur**.
- Le **Domaine** (`src/domain/`) est **100 % pur** : aucune dépendance externe, aucune I/O, aucun framework.
- Les bibliothèques tierces (`pdf-lib`, `pdfjs-dist`, `node-forge`, `docx`) sont **strictement encapsulées** dans les **Providers** (`src/providers/`). Ni la couche Domaine, ni la couche Application, ni la couche UI ne doivent manipuler directement des objets de ces bibliothèques.

---

## 4. Principes Directeurs d'Ingénierie (Méthodologie REA)

1. **Distinction Épistémique REA** :
   - **Observations** : Octets PDF bruts vérifiés, flux d'objets, signatures PKCS#7 extraites, pixels rendus sur le canvas.
   - **Dérivations** : Arbre des pages parsé, schéma de formulaire AcroForm, chaîne de certificats X.509 validée.
   - **Inférences** : Regroupements heuristiques de texte ou de mise en page (par exemple lors de l'export Word).
   - **Inconnus** : Extensions PDF propriétaires non reconnues, tables cross-reference corrompues, autorités de certification racines non vérifiées.
2. **Propriétaire Canonique Unique (Single Canonical Owner)** :
   Chaque format, ressource ou flux externe possède un propriétaire unique qui valide et normalise les données d'entrée une seule fois. Les modules avals consomment uniquement les faits validés via des objets typés `Result<T, DomainError>`.
3. **Propriété Explicite du Cycle de Vie (Lifecycle Ownership)** :
   Les descripteurs de documents, workers PDF.js, contextes Canvas, caches de bitmaps et fichiers de staging temporaires sont gérés avec libération explicite de mémoire lors de la fermeture d'un document ou d'un onglet.
4. **Intégrité de la Source & Staging Atomique** :
   Le fichier source d'origine n'est **jamais modifié en place directement**. Toute sauvegarde passe par une écriture dans un fichier temporaire de staging suivi d'un remplacement atomique après validation du SHA-256.
5. **Budgets d'Admission et Tolérance aux Pannes** :
   Tout flux binaire entrant est borné par des quotas stricts (taille max, nombre de pages, magic bytes). Si une limite est dépassée ou si les magic bytes ne correspondent pas, le système échoue de manière contrôlée et explicite (`fail-closed`).
