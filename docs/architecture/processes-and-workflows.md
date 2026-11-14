# Processus Métier de Bout en Bout (Workflows)

Ce document décrit en détail les algorithmes et les flux d'exécution pour chaque cas d'usage clé d'**OpenPDF**.

---

## Processus 1 : Démarrage et Ouverture d'un Document

```mermaid
sequenceDiagram
    autonumber
    actor User as Utilisateur
    participant UI as Interface React (App.tsx)
    participant Host as Tauri Bridge (IPC Rust)
    participant FS as Bounded FileSystem
    participant Session as DocumentSession
    participant PDFJS as pdfJsRenderer

    User->>UI: Clic "Ouvrir" ou Double-clic fichier
    alt Lancement Bureau Tauri
        UI->>Host: invoke('read_pdf_file_bounded', path, 256MB)
        Host->>Host: Contrôle taille OS & Lecture bornée
        Host-->>UI: Uint8Array des octets bruts
    else Navigateur Web
        UI->>User: Boîte de dialogue showOpenFilePicker()
        User-->>UI: Fichier sélectionné
    end
    UI->>FS: admitPdfBytes(rawBytes)
    FS->>FS: Vérifie 0 < taille <= 256MB & En-tête "%PDF-"
    FS->>FS: Calcule SHA-256
    FS-->>UI: Ok(DocumentIdentity)
    UI->>Session: openPdfSession(identity, rawBytes)
    Session->>PDFJS: PdfJsDocumentHandle.create(rawBytes)
    PDFJS->>PDFJS: Initialise worker, extrait metadata, outlines, page metrics
    PDFJS-->>Session: Instance Renderer prête
    Session-->>UI: Ok(OpenedSessionBundle)
    UI->>UI: Ajoute ou active l'onglet (DocumentTabState)
    UI->>UI: Déclenche le rendu de la page 1
```

1. **Vérification d'instance unique (Rust)** : Si l'application est déjà ouverte, l'événement `open-pdf-request` transmet le chemin du fichier sans créer de nouvelle fenêtre.
2. **Admission bornée** : Tout fichier rejeté (trop volumineux, non-PDF) génère une `DomainError` explicite affichée dans un bandeau toast.
3. **Ouverture de session** : Le bundle créé comprend le parseur de métadonnées, le sommaire hiérarchique, les champs de formulaires existants et l'historique `CommandLedger` initialisé.

---

## Processus 2 : Rendu des Pages et Virtualisation du Viewport

```mermaid
flowchart TD
    A["Événement Scroll ou Zoom"] --> B["Calcul des pages visibles dans le viewport"]
    B --> C{"Page en cache LRU ?"}
    C -- Oui --> D["Affichage instantané du bitmap en cache"]
    C -- Non --> E["Annulation de la tâche de rendu précédente si active"]
    E --> F["PDF.js renderPageBitmap(pageIndex, zoom, rotation)"]
    F --> G["Tracé sur HTML5 Canvas"]
    G --> H["Mise en cache du bitmap (clé: index:zoom:rot:rev)"]
    H --> I["Injection de la couche texte pour sélection & recherche"]
```

- **Clé d'invalidation du cache** : Le cache LRU (12 pages max) est invalidé dès qu'une modification sur la page est appliquée (`revision` incrémentée) ou que le zoom/rotation change.
- **Réactivité UI** : Les rendus annulés ne bloquent pas le thread de l'interface utilisateur.

---

## Processus 3 : Édition de Contenu et Gestion de l'Historique

Ce processus s'applique à l'ajout de texte, biffures (caviardage), surlignages, annotations, et modifications de formulaires.

```mermaid
sequenceDiagram
    autonumber
    actor User as Utilisateur
    participant Canvas as PdfPageCanvas
    participant App as App.tsx (State)
    participant Ledger as CommandLedger
    participant Mutator as pdfLibMutator

    User->>Canvas: Sélectionne outil "Texte" et clique sur la page
    Canvas->>Canvas: Calcule coordonnées relatives NormalizedRect [0..1]
    Canvas->>App: onAddText({ rect, text, fontSize, color, fontFamily })
    App->>Ledger: execute(AddTextCommand)
    Ledger->>Ledger: Empile la commande, met à jour EditorDocumentState
    Ledger->>Ledger: Incrémente revision, vide la pile Redo
    Ledger-->>App: Nouvel état immuable
    App->>App: Marque l'onglet dirty (isDirty = true)
    App->>Canvas: Mise à jour optimiste (re-render de l'overlay)
    Note over User,App: Si l'utilisateur appuie sur Ctrl+Z
    User->>App: Raccourci Annuler (Undo)
    App->>Ledger: undo()
    Ledger-->>App: État antérieur restauré
    App->>Canvas: Rafraîchissement visuel immédiat
```

- **Biffures (Caviardage)** : Les blocs de masquage créés sont physiquement appliqués lors de la compilation par `pdfLibMutator`, garantissant que le texte masqué est définitivement supprimé du document final.

---

## Processus 4 : Réorganisation et Gestion des Pages

1. **Affichage de la grille d'organisation** : Le composant `PageOrganizerGrid.tsx` affiche l'ensemble des pages sous forme de vignettes avec leur numéro d'origine.
2. **Glisser-Déposer (Drag & Drop)** : L'utilisateur réordonne les vignettes. L'ordre cible est consigné dans `state.pageOrder`.
3. **Rotation individuelle ou globale** : Envoi de la commande `SetPageRotationCommand(pageIndex, angle)`. L'angle est normalisé selon `(rotation + 90) % 360`.
4. **Suppression de page** : Vérification de la règle de sécurité métier : interdiction formelle de supprimer la dernière page restante (`CannotDeleteLastPage`).
5. **Extraction de pages** : La fonction `extractPdfPageRange(bytes, range)` isole les pages voulues dans un nouveau document PDF indépendant ouvert dans un nouvel onglet.
6. **Fusion de documents** : La fonction `mergePdfDocuments([docA, docB, ...])` concatène les flux en respectant le budget d'admission de 512 Mo (`MAX_MERGE_TOTAL_BYTES`).

---

## Processus 5 : Signature Électronique et Coffre-Fort

```mermaid
sequenceDiagram
    autonumber
    actor User as Utilisateur
    participant UI as SignatureVaultPanel
    participant Crypto as signatureProvider
    participant Mutator as pdfLibMutator
    participant Host as Tauri Bridge

    User->>UI: Sélectionne signature visuelle + fichier .pfx/.p12 + mot de passe
    User->>UI: Place le cadre de signature sur la page cible
    UI->>Crypto: signPdfWithPkcs12(pdfBytes, options)
    Crypto->>Crypto: Déverrouille conteneur PKCS#12, extrait clé RSA et cert X.509
    Crypto->>Mutator: Insère widget visuel et champ /Sig avec placeholder /Contents
    Mutator-->>Crypto: PDF préparé avec offsets connus
    Crypto->>Crypto: Calcule table /ByteRange [0, off1, off2, len2]
    Crypto->>Crypto: Hache les octets du document via SHA-256
    Crypto->>Crypto: Génère enveloppe PKCS#7 (SignedData, SigningTime, Cert X.509)
    Crypto->>Crypto: Injecte les octets hexadécimaux PKCS#7 dans /Contents
    Crypto-->>UI: Ok(signedPdfBytes)
    UI->>UI: Recharge la session avec le document signé
    UI->>Crypto: verifyPdfSignatures(signedPdfBytes)
    Crypto-->>UI: Signature valide, certificat certifié
```

- **Coffre-fort local** : Les signatures manuscrites et tampons graphiques sont stockés dans le coffre-fort local persistant (`signatureVaultStore.ts`).
- **Protection des données sensibles** : Les mots de passe et clés privées ne sont **jamais stockés**, ni journalisés. Ils sont consommés en mémoire vive pour l'opération de signature et immédiatement détruits.

---

## Processus 6 : Sauvegarde Atomique et Écrasement Sécurisé

```mermaid
flowchart TD
    A["Utilisateur clique sur Enregistrer (Ctrl+S)"] --> B{"Le document a-t-il un chemin connu ?"}
    B -- Non --> C["Déclenchement du flux Enregistrer sous..."]
    B -- Oui --> D["DocumentSession.compilePdf() avec l'EditorDocumentState actuel"]
    D --> E["Génération du Uint8Array du PDF final"]
    E --> F["Tauri Bridge : invoke('write_pdf_atomic', path, bytes)"]
    F --> G["Rust : Écriture dans <path>.staging.<pid>.tmp"]
    G --> H["Rust : Vérification taille & recalcul SHA-256"]
    H --> I["Rust : Remplacement atomique std::fs::rename()"]
    I --> J["Succès : isDirty = false, ledgerRevision synchronisé"]
```

- **Garantie de non-corruption** : En cas de coupure de courant ou de blocage pendant l'écriture disque, le fichier d'origine reste intact car le fichier temporaire de staging n'a pas encore remplacé la cible.

---

## Processus 7 : Conversion et Export Multi-Formats

1. **Sélection du format** : Via la fenêtre `ExportFormatsModal.tsx` (`Word .docx`, `PowerPoint .pptx`, `Excel .xlsx`, `Page Web .html`, `Archive PNG/JPEG .zip`, `Texte brut .txt`).
2. **Options d'export** : Choix des pages (toutes, page active, plage personnalisée), qualité des images et préservation des blocs.
3. **Orchestration (`DocumentExportService`)** :
   - Émission d'un événement de début (`ConversionProgress: phase 'analyzing'`).
   - Extraction structurée du texte et des images via `pdfJsRenderer`.
   - Routage vers le provider de conversion dédié (`docxExporter`, `pptxExporter`, etc.).
   - Émission de la progression par page traitée.
   - Assemblage et compression ZIP le cas échéant (`fflate`).
4. **Livraison du fichier** :
   - Sous Tauri : Boîte de dialogue native d'enregistrement et écriture atomique (`write_binary_file_atomic`).
   - Sous Web : Téléchargement direct du Blob généré.

---

## Processus 8 : Gestion Multi-Onglets et Fermeture

1. **Création d'un onglet (`openTab`)** : Chaque onglet possède son propre identifiant `tabId`, son chemin de fichier, son historique propre et ses paramètres de vue (zoom, page active).
2. **Bascule d'onglet (`setActiveTab`)** : L'interface désabonne le canvas de l'ancienne session et rattache le nouvel onglet sans recharger les octets disque.
3. **Fermeture d'onglet (`closeTab`)** :
   - Si `isDirty === true` : Une boîte de dialogue modale s'affiche avec trois choix : *Enregistrer*, *Ne pas enregistrer*, ou *Annuler*.
   - Après confirmation : Libération explicite des ressources graphiques et des descripteurs (`session.destroy()`).
4. **Fermeture de l'application** : Parcours séquentiel de l'ensemble des onglets avec alerte groupée si des modifications non sauvegardées existent.
