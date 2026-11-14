# Interface Utilisateur, Composants et Arbre d'État

Ce document cartographie l'architecture visuelle et réactive d'**OpenPDF** (`src/adapters/ui/`).

---

## 1. Arborescence des Composants UI

```text
src/adapters/ui/App.tsx (Composant Racine & Coordinateur d'État)
 ├── AcrobatMenuBar.tsx (Barre de Menus & Outils Rapides style Adobe Acrobat)
 ├── DocumentTabBar.tsx (Bandeau Multi-Onglets avec Indicateurs d'État)
 ├── Main Layout (Corps de l'application)
 │    ├── LeftSidebar.tsx (Panneau Latéral Rétractable : Vignettes, Sommaire, Signatures)
 │    ├── Central Viewport (Scène Centrale de Visualisation & Édition)
 │    │    └── PdfPageCanvas.tsx (Canvas HTML5, Couche Texte & Calque d'Interactions)
 │    └── FormatInspectorPanel.tsx (Barre d'outils flottante de formatage : police, couleur, etc.)
 └── Modales & Dialogues Flottants
      ├── PageOrganizerGrid.tsx (Grille d'organisation des pages, glisser-déposer)
      ├── SignatureVaultPanel.tsx (Coffre-fort de signatures, création graphique & PFX)
      ├── ExportFormatsModal.tsx (Dialogue d'exportation multi-formats avec barre de progression)
      └── SaveAndDialogs.tsx (Confirmations de fermeture non-sauvegardée, saisie mot de passe)
```

---

## 2. Décomposition des Composants Principaux

### 2.1 Le Composant Racine : `App.tsx`
Centralise l'état global de l'application et orchestre la communication entre les sous-composants :
- **Gestion des onglets** : Tableau `tabs: DocumentTabState[]`, identifiant actif `activeTabId`.
- **Session active** : `activeSession: OpenedSessionBundle | null`.
- **Mode d'outil actif (`activeTool`)** :
  - `'select'` : Sélection de texte et d'objets existants.
  - `'hand'` : Défilement libre au curseur (pan).
  - `'text'` : Insertion d'un nouveau bloc de texte.
  - `'whiteout'` : Outil de biffure / caviardage opaque.
  - `'highlight'` / `'underline'` / `'strikeout'` : Outils d'annotation de texte.
  - `'draw'` : Dessin vectoriel à main levée.
  - `'shapes'` : Insertion de rectangles, ellipses ou lignes.
  - `'signature'` : Placement interactif d'une signature numérique.
  - `'stamp'` : Insertion de tampons pré-définis (Approuvé, Confidentiel, etc.).
- **Écouteurs système** : Détecte les raccourcis clavier (`Ctrl+S`, `Ctrl+Z`, `Ctrl+O`, etc.) et écoute les événements IPC Tauri (`open-pdf-request`).

### 2.2 Barre de Menus : `AcrobatMenuBar.tsx`
Reprend l'ergonomie fidèle d'*Adobe Acrobat Pro* :
- **Menus déroulants** :
  - **Fichier** : Nouveau, Ouvrir (`Ctrl+O`), Enregistrer (`Ctrl+S`), Enregistrer sous (`Ctrl+Shift+S`), Exporter vers..., Fermer (`Ctrl+W`), Quitter.
  - **Édition** : Annuler (`Ctrl+Z`), Rétablir (`Ctrl+Y`), Couper, Copier, Coller, Rechercher (`Ctrl+F`).
  - **Affichage** : Zoom avant (`Ctrl++`), Zoom arrière (`Ctrl+-`), Ajuster à la page (`Ctrl+0`), Taille réelle (`Ctrl+1`), Rotation horaire / anti-horaire, Mode plein écran.
  - **Outils** : Organiser les pages, Modifier le texte et les images, Annotations, Formulaires.
  - **Signer** : Signer électroniquement, Gérer le coffre-fort de signatures, Valider les signatures du document.
  - **Fenêtre / Aide** : Navigation multi-onglets, À propos d'OpenPDF.
- **Bandeau d'outils rapides** : Accès direct en un clic aux fonctions les plus courantes.

### 2.3 Bandeau d'Onglets : `DocumentTabBar.tsx`
- Affiche la liste des documents ouverts.
- Indique l'état de modification par une pastille (`isDirty`).
- Bouton de fermeture d'onglet individuel avec sécurité anti-perte de données.
- Bouton `+` pour créer un document vierge ou ouvrir un nouveau fichier.

### 2.4 Panneau Latéral Gauche : `LeftSidebar.tsx`
Barre latérale pliable comportant plusieurs modes :
- **Vignettes (`thumbnails`)** : Liste verticale des aperçus des pages avec défilement rapide.
- **Sommaire (`outlines`)** : Arborescence hiérarchique des chapitres et sections du PDF.
- **Signatures (`signatures`)** : Panneau d'audit listant les signatures numériques détectées, la validité du certificat X.509 et l'intégrité du document.
- **Pièces jointes (`attachments`)** : Fichiers incorporés dans le conteneur PDF.

### 2.5 Scène Centrale d'Affichage & Édition : `PdfPageCanvas.tsx`
Le composant le plus dense de l'application :
- **Canvas HTML5** : Reçoit le tracé vectoriel / bitmap issu de `pdfJsRenderer`.
- **Text Layer** : Couche d'éléments HTML superposée permettant la surbrillance et la sélection native du texte au curseur.
- **Interactive Overlay** :
  - Détecte les clics, sélections et étirements de zone.
  - Convertit en temps réel les coordonnées de la souris en coordonnées normalisées `NormalizedRect` `[0..1]`.
  - Affiche en surbrillance les éléments en cours de modification (boîtes de texte, surlignages, cadres de signature).

### 2.6 Inspecteur de Format Flottant : `FormatInspectorPanel.tsx`
Apparaît dynamiquement au-dessus de l'élément sélectionné :
- Choix de la police : Helvetica, Times Roman, Courier.
- Taille de police en points (8 à 72 pt).
- Graisse (Gras / Italique), Alignement (Gauche, Centré, Droite).
- Palette de couleurs hexadécimales, opacité du tracé.

### 2.7 Grille d'Organisation des Pages : `PageOrganizerGrid.tsx`
- Vue plein écran en mosaïque de l'ensemble des pages.
- Prise en charge du glisser-déposer (Drag & Drop) pour réorganiser les pages.
- Actions par page : pivoter de 90°, supprimer (avec garde-fou dernière page), insérer une page vierge, dupliquer.

### 2.8 Coffre-Fort de Signatures : `SignatureVaultPanel.tsx`
- **Création de signatures** :
  - *Dessiner* : Tableau tactile / souris pour tracer sa signature manuscrite.
  - *Importer* : Chargement d'une image de signature ou tampon (PNG, JPEG, SVG) avec rognage automatique du blanc.
  - *Saisir* : Génération calligraphique basée sur le nom de l'utilisateur.
- **Signature cryptographique** :
  - Sélection du fichier PKCS#12 (`.pfx` ou `.p12`).
  - Champ de saisie sécurisé pour le mot de passe (non persisté).
  - Paramètres légaux : Motif (`reason`), Lieu (`location`), Contact.

### 2.9 Dialogue d'Exportation : `ExportFormatsModal.tsx`
- Sélection visuelle du format cible (Word, PowerPoint, Excel, HTML, Images, Texte).
- Options de conversion : sélection des pages et niveau de qualité.
- Barre de progression animée avec étapes détaillées (analyse, conversion, compression).

### 2.10 Dialogues de Sauvegarde et Système : `SaveAndDialogs.tsx`
- **Confirmation de fermeture** : "Voulez-vous enregistrer les modifications apportées à [NomDocument] avant de fermer ?" (Enregistrer / Ne pas enregistrer / Annuler).
- **Déverrouillage PDF protégé** : Demande du mot de passe utilisateur pour les documents chiffrés.
- **Gestionnaire de Toasts** : Affichage discret des messages de confirmation et d'erreurs d'admission.

---

## 3. Table des Raccourcis Clavier Supportés

| Combinaison | Action Déclenchée |
| :--- | :--- |
| `Ctrl + O` | Ouvrir un fichier PDF |
| `Ctrl + S` | Enregistrer le document courant |
| `Ctrl + Shift + S` | Enregistrer sous un nouveau nom |
| `Ctrl + W` | Fermer l'onglet actif (avec vérification si non sauvegardé) |
| `Ctrl + Z` | Annuler la dernière opération (Undo) |
| `Ctrl + Y` ou `Ctrl + Shift + Z` | Rétablir l'opération annulée (Redo) |
| `Ctrl + +` / `Ctrl + -` | Zoom avant / Zoom arrière |
| `Ctrl + 0` | Ajuster à la page |
| `Ctrl + 1` | Taille réelle (100 %) |
| `Ctrl + F` | Ouvrir la recherche dans le document |
| `Échap` | Annuler l'outil en cours / Revenir au mode sélection |
