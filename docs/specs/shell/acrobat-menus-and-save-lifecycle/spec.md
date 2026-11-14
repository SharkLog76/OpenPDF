# Organisation des menus Acrobat Pro & Cycle de sauvegarde (`shell/acrobat-menus-and-save-lifecycle`)

## Outcome and scope

Reproduire fidèlement l'organisation ergonomique d'**Adobe Acrobat Pro** (barre de menus classique + onglets d'ateliers + volet gauche « Tous les outils » + rail de navigation/propriétés) et permettre à l'utilisateur, après toute modification ou signature, soit d'**écraser le fichier PDF d'origine**, soit de **créer une nouvelle version** (`Enregistrer sous…`).

**ADR liée** : [Stack technique et moteurs PDF](../../../adr/architecture/stack-and-pdf-engine.md)

## Functional contract

1. **Organisation des menus Adobe Acrobat Pro** :
   - **Barre de menus supérieure** :
     - `Fichier` : Ouvrir (`Ctrl+O`), Nouveau PDF vierge, Ouvrir Démo, Enregistrer / Écraser l'original (`Ctrl+S`), Enregistrer sous / Nouvelle version (`Ctrl+Shift+S`), Recharger l'original, Combiner des fichiers, Organiser / Extraire des pages, Propriétés du document (`Ctrl+D`), Fermer.
     - `Édition` : Annuler (`Ctrl+Z`), Rétablir (`Ctrl+Y`), Modifier le texte et les images, Ajouter du texte, Ajouter une image, Effacer / Biffer une zone, Rechercher (`Ctrl+F`).
     - `Affichage` : Zoom (`+`, `-`, `100%`, Ajuster largeur, Ajuster page), Mode d'affichage (Page unique, Continu, Double page), Rotation horaire, Panneau Tous les outils, Volet Navigation, Thème Sombre/Clair.
     - `Outils` : Accès direct à tous les ateliers (`Modifier le PDF`, `Commentaire`, `Remplir et signer`, `Certificats PKCS#7`, `Organiser les pages`, `Préparer un formulaire`, `Filigrane`, `En-tête et pied de page`, `Recadrer les pages`).
     - `Fenêtre` : Réinitialiser les panneaux, Plein écran.
     - `Aide` : Raccourcis clavier, Preuves REA & À propos.
   - **Barre d'onglets contextuelle Acrobat** : Onglets d'ateliers (`Tous les outils`, `Modifier`, `Commenter`, `Signer`, `Organiser`, `Formulaire`), onglet document avec indicateur `*` de modifications non enregistrées, et boutons rapides `Enregistrer` / `Nouvelle version`.
   - **Volet gauche commutable** : `Tous les outils` (catalogue d'outils Acrobat), `Pages` (miniatures), `Signets`, `Rechercher`, `Champs`, `Modifications`.
2. **Cycle de sauvegarde (Écrasement vs Nouvelle version)** :
   - **Capture du handle disque** : à l'ouverture via `showOpenFilePicker()` ou glisser-déposer (`getAsFileSystemHandle()`), conserver la référence `FileSystemFileHandle`.
   - **Écraser le fichier d'origine (`Ctrl+S`)** : après action explicite et confirmation de l'utilisateur, écriture atomique via `FileSystemWritableFileStream` (`createWritable()` $\rightarrow$ `write()` $\rightarrow$ `close()`), puis ré-admission propre comme nouvelle base (`isDirty = false`, SHA-256 actualisé).
   - **Créer une nouvelle version (`Ctrl+Shift+S` / `Enregistrer sous…`)** : suggestion de nom versionné (`<nom>_v2.pdf` ou sélecteur natif `showSaveFilePicker()`), sauvegarde sans altérer le fichier source, et bascule optionnelle sur le nouveau fichier sauvegardé.
   - **Mode dégradé explicite** : si le navigateur ou le mode d'ouverture ne fournit pas de `FileSystemFileHandle` (ex. Firefox, fichier de démonstration), l'action d'écrasement est explicitement signalée comme indisponible et redirige vers `Enregistrer sous…`.

## Non-goals

- Synchronisation cloud Adobe Document Cloud (OpenPDF reste 100 % local-first).

## Resource admission

- Raccourcis clavier globaux gérés proprement (ignorés lorsque le focus est dans un champ texte/textarea).
- Protection contre la perte de modifications : avertissement si fermeture/réouverture alors que `isDirty === true`.
- Nouvelles erreurs typées : `OverwriteHandleUnavailable`, `OverwritePermissionDenied`, `OverwriteFailed`.

## Verification

- Tests unitaires sur la dérivation de nom de nouvelle version (`deriveNextVersionFilename`), l'état `isDirty`, la gestion des erreurs de permission/handle absent, et l'écriture atomique mockée sur un `FileSystemFileHandle`.
- Vérification `tsc --noEmit`, `vitest` et `vite build`.
