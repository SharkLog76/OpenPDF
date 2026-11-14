# Modules Applicatifs et Fournisseurs Techniques (Providers)

Ce document détaille le fonctionnement interne de chaque service et fournisseur d'infrastructure d'**OpenPDF**.

---

## 1. Fournisseurs Techniques (`src/providers/`)

Les *Providers* sont les seuls modules autorisés à manipuler des dépendances externes ou des protocoles bas niveau.

### 1.1 Rendu Visuel : `src/providers/renderer/pdfJsRenderer.ts`
- **Dépendance** : `pdfjs-dist` (configuré avec worker web dédié).
- **Rôle** : Charger et interpréter la structure interne du PDF, extraire le texte pour la sélection/recherche et peindre chaque page sur un élément `<canvas>`.
- **Composant clé** : Classe `PdfJsDocumentHandle` :
  - **Mise en cache LRU** : Mémorise jusqu'à 12 bitmaps de pages (`MAX_RENDER_CACHE_PAGES`) pour un affichage instantané lors du défilement.
  - **Clé de cache composite** : `pageIndex:zoom:rotation:revision`.
  - **Gestion de l'annulation (`RenderTask`)** : Si l'utilisateur zoome ou change de page avant la fin d'un tracé, la tâche en cours est immédiatement annulée pour ne pas saturer le thread principal.
  - **Libération explicite (`destroy()`)** : Nettoie les workers et détruit l'instance PDF.js à la fermeture du document.

### 1.2 Mutation Structurelle & Édition : `src/providers/mutator/pdfLibMutator.ts`
- **Dépendance** : `pdf-lib`.
- **Rôle** : Appliquer les modifications métier au document original et produire le nouveau binaire sérialisé.
- **Fonction maîtresse : `compileEditedPdf(originalBytes, state)`** :
  1. Charge les octets d'origine dans un `PDFDocument`.
  2. **Réorganisation & Suppression** : Applique l'ordre spécifié dans `state.pageOrder` et exclut les pages présentes dans `state.deletedPageIndices`.
  3. **Rotations** : Ajuste les angles de vue page par page (`state.pageRotations`).
  4. **Biffures & Caviardage (`whiteouts`)** : Trace des rectangles opaques (blancs ou noirs) pour masquer définitivement les zones sensibles sous-jacentes.
  5. **Incrustation de Texte (`textOverlays`)** : Embarque les polices standards (`StandardFonts.Helvetica`, `TimesRoman`, `Courier`), calcule la taille en points et écrit le texte avec couleur et alignement.
  6. **Annotations Graphiques** : Surlignages translucides, rectangles, ellipses, notes et tracés manuscrits.
  7. **Champs de Formulaire (`AcroForm`)** : Met à jour les valeurs des champs textuels, cases à cocher et menus déroulants.
  8. **Filigranes et En-têtes/Pieds de page** : Dessine les éléments récurrents sur chaque page sélectionnée.
  9. **Sérialisation finale** : Génère un `Uint8Array` optimisé.

### 1.3 Moteur Cryptographique & Signature : `src/providers/crypto/signatureProvider.ts`
- **Dépendance** : `node-forge`.
- **Rôle** : Fournir une signature numérique conforme aux spécifications Adobe Acrobat (`/Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached`).
- **Fonction maîtresse : `signPdfWithPkcs12(pdfBytes, options)`** :
  1. **Déverrouillage PKCS#12** : Décode le conteneur binaire `.pfx` ou `.p12` à l'aide du mot de passe fourni. Extrait la clé privée RSA et la chaîne de certificats X.509.
  2. **Ajout du champ de signature visuel** : Insère un dictionnaire de signature (`/Sig`) sur la page cible avec la représentation visuelle (griffe ou tampon) et les métadonnées (nom, motif, lieu, date).
  3. **Réservation de l'espace de signature** : Alloue une zone réservée `/Contents <00000...>` de taille fixe (8 192 octets hexadécimaux).
  4. **Calcul de la table `/ByteRange`** : Localise précisément l'offset de début et de fin du conteneur `/Contents` dans le fichier final pour définir les deux segments protégés :
     `[0, offset_debut, offset_fin, longueur_restante]`.
  5. **Hachage cryptographique** : Calcule le digest SHA-256 sur l'ensemble des octets du fichier en excluant la zone `/Contents`.
  6. **Génération de l'enveloppe PKCS#7** : Construit une structure ASN.1 `SignedData` contenant les attributs authentifiés (SigningTime, MessageDigest SHA-256), signe le haché avec la clé privée RSA et intègre le certificat X.509.
  7. **Scellement du binaire** : Convertit l'enveloppe PKCS#7 en hexadécimal et l'injecte dans le placeholder `/Contents` du binaire final.
- **Fonction `verifyPdfSignatures(pdfBytes)`** : Parcourt les dictionnaires `/Sig` du document, extrait la table `/ByteRange`, recalcule le hachage des segments et vérifie la signature PKCS#7 et le certificat associé.

### 1.4 Système de Fichiers & Admission Bornée : `src/providers/filesystem/boundedFileSystem.ts`
- **Rôle** : Point d'entrée de sécurité pour tout flux PDF entrant.
- **`admitPdfBytes(bytes)`** :
  - Calcule l'empreinte cryptographique SHA-256 du document pour son identité immuable.
  - Valide la taille contre la limite de 256 Mo (`MAX_PDF_BYTES`).
  - Vérifie la présence de l'en-tête `%PDF-` dans les 1 024 premiers octets.
  - Retourne un objet `DocumentIdentity` (`id`, `displayName`, `byteLength`, `sha256`).
- **Générateurs** : `createBlankPdfBytes()` (PDF vierge A4) et `createSamplePdfBytes()` (guide de démarrage).

### 1.5 Moteurs d'Exportation Multi-Formats : `src/providers/converter/`
- **`docxExporter.ts`** : Transforme le flux textuel et les titres du PDF en document Microsoft Word `.docx` structuré via la bibliothèque `docx`.
- **`pptxExporter.ts`** : Génère une présentation Microsoft PowerPoint `.pptx` (archive OpenXML zippée via `fflate`) où chaque page du PDF devient une diapositive avec ses blocs de texte positionnés.
- **`xlsxExporter.ts`** : Analyse les alignements tabulaires et produit un classeur Excel `.xlsx`.
- **`webAndImageExporter.ts`** :
  - Export HTML autonome avec mise en page CSS.
  - Export archive ZIP (`fflate`) contenant le rendu haute résolution (PNG ou JPEG) de l'ensemble des pages.

---

## 2. Couche Application (`src/application/`)

### 2.1 Coordinateur de Document : `src/application/session/DocumentSession.ts`
- Maintient l'état du document actif ouvert (`OpenedSessionBundle`) :
  - Identité (`DocumentIdentity`)
  - Octets originaux bruts (`sourceBytes`)
  - Handle du moteur de rendu (`PdfJsDocumentHandle`)
  - Métriques des pages (`PageMetrics[]`)
  - Sommaire hiérarchique (`OutlineNode[]`)
  - Champs de formulaires découverts (`AcroFormFieldDescriptor[]`)
  - Signatures numériques vérifiées (`SignatureVerificationRecord[]`)
  - Registre de commandes (`CommandLedger`)
- Fournit les méthodes d'accès unifiées pour compiler le document modifié, extraire des pages ou fusionner d'autres fichiers.

### 2.2 Registre de Commandes Déterministe : `src/application/ledger/CommandLedger.ts`
- Implémente le pattern **Command** avec historique immuable pour le support de **Undo / Redo**.
- Limité à 200 opérations en mémoire (`MAX_LEDGER_HISTORY`).
- Chaque commande (`EditCommand`) incrémente un compteur de révision utilisé pour invalider les caches d'affichage.

### 2.3 Service de Conversion : `src/application/converter/DocumentExportService.ts`
- Orchestre l'extraction des données du document actif et délègue au convertisseur approprié selon le format cible demandé (`docx`, `pptx`, `xlsx`, `html`, `png-archive`).
- Émet des événements de progression (`ConversionProgress`) pour informer l'utilisateur en temps réel.

---

## 3. Bridge Desktop Tauri et Backend Rust

### 3.1 Adaptateur Frontend : `src/adapters/host/tauriBridge.ts`
Détecte automatiquement l'environnement d'exécution (Bureau natif Tauri vs Navigateur Web standard) :
- En environnement **Tauri** : Appelle les commandes Rust via `window.__TAURI_INTERNALS__.invoke()`.
- En environnement **Web standard** : Propose un mode dégradé basé sur les API HTML5 standard (`showOpenFilePicker`, `showSaveFilePicker`, téléchargement direct par blob).

### 3.2 Backend Natif Rust (`src-tauri/`)
- **`src-tauri/src/lib.rs`** :
  - Initialise le plugin `single-instance` : si l'utilisateur lance un deuxième processus avec un fichier PDF en paramètre (ex. double-clic dans l'explorateur Windows), la fenêtre existante prend le focus et reçoit l'événement `open-pdf-request` sans réouvrir une nouvelle application.
  - Déclare les commandes IPC exposées au frontend :
    - `get_launch_pdf_args()`
    - `read_pdf_file_bounded(path, max_bytes)`
    - `write_pdf_atomic(path, bytes)`
    - `write_binary_file_atomic(path, bytes)`
- **`src-tauri/src/pdf_io.rs`** :
  - Réalise la lecture système bornée avec contrôle de taille avant allocation mémoire.
  - Réalise l'**écriture atomique** : écrit les octets dans un fichier temporaire `<cible>.staging.<pid>.tmp`, valide la taille et le hachage, puis réalise un remplacement atomique (`std::fs::rename`) pour garantir qu'aucune interruption ou crash système ne puisse corrompre le fichier source.
- **`src-tauri/src/window_manager.rs`** : Routage et gestion du focus des fenêtres natives.
