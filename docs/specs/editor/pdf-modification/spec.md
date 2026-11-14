# Modification complète de PDF (`editor/pdf-modification`)

## Outcome and scope

Permettre la modification **complète** — structurelle, textuelle et visuelle — d'un document PDF existant (comme l'outil *Modifier un PDF* d'Adobe Acrobat Pro) avec historique déterministe Undo/Redo (`CommandLedger`) et sauvegarde explicite (écrasement du fichier source ou nouvelle version).

**ADR liée** : [Stack technique et moteurs PDF](../../../adr/architecture/stack-and-pdf-engine.md)  
**Dépendances** : [Lecture de PDF](../../viewer/pdf-reading/spec.md), [Menus Acrobat & Sauvegarde](../../shell/acrobat-menus-and-save-lifecycle/spec.md)

## Functional contract

1. **Command Ledger (Undo / Redo déterministe)** :
   - Toute modification passe par une commande typée réversible dans le `CommandLedger` :
     - Édition de texte existant (`UPDATE_EXISTING_TEXT`, `DELETE_EXISTING_TEXT`, `RESTORE_EXISTING_TEXT`)
     - Ajouts : `ADD_TEXT`, `UPDATE_TEXT`, `DELETE_TEXT`, `ADD_ANNOTATION`, `DELETE_ANNOTATION`, `INSERT_IMAGE`, `UPDATE_IMAGE_RECT`, `DELETE_IMAGE`, `ADD_WHITEOUT`, `DELETE_WHITEOUT`, `ADD_LINK`, `DELETE_LINK`
     - Enrichissements globaux : `SET_WATERMARK`, `SET_HEADER_FOOTER`, `SET_PAGE_CROP`, `SET_PAGE_BACKGROUND`
     - Structure des pages : `ROTATE_PAGE`, `DELETE_PAGE`, `DUPLICATE_PAGE`, `INSERT_BLANK_PAGE`, `INSERT_EXTERNAL_PAGES`, `REORDER_PAGES`
     - Formulaires : `CREATE_FORM_FIELD`, `DELETE_FORM_FIELD`, `SET_FORM_FIELD`
2. **Édition directe du contenu PDF existant (« Modifier un PDF »)** :
   - Détection et regroupement déterministe des blocs de texte existants du PDF (`ExistingTextBlock`) avec coordonnées exactes en points PDF.
   - Échantillonnage automatique de la couleur de fond (`backgroundHex`) et de la couleur de police détectée (`textColorHex`) autour de chaque bloc sur le canvas rendu, afin de pouvoir modifier, déplacer, restyler (police Helvetica/Times/Courier, gras, italique, taille, couleur, alignement) ou supprimer **n'importe quel paragraphe existant**, y compris sur des bandeaux colorés.
   - **Gomme / Effaceur & Biffure (`Whiteout / Redact`)** : masquer/effacer n'importe quelle zone (graphique, logo, texte scanné) avec couleur auto-échantillonnée ou couleur choisie (blanc / noir biffure).
3. **Éléments avancés & Mise en page Acrobat Pro** :
   - **Liens hypertextes cliquables** (`/Annot /Subtype /Link` URI ou page cible).
   - **Filigrane (`Watermark`)** : texte personnalisable, taille, opacité, angle, plage de pages.
   - **En-tête, Pied de page & Numérotation** : texte haut/bas gauche-centre-droite avec variables `{page}`, `{total}`, `{date}`.
   - **Arrière-plan de page & Recadrage (`CropBox`)** : marges de recadrage par page ou sur toutes les pages.
   - **Insertion d'images** : PNG, JPEG, WebP, SVG (normalisés en PNG/JPEG avant injection).
4. **Manipulation complète des pages** :
   - Ajouter une page vierge (A4 / Lettre ou taille de la page courante) à n'importe quelle position.
   - Insérer un autre PDF à une position choisie, fusionner plusieurs PDF, extraire/diviser une plage, réorganiser, pivoter, dupliquer, supprimer (avec garde-fou `CannotDeleteLastPage`).
5. **Formulaires AcroForm (Remplissage + Création)** :
   - Créer de nouveaux champs texte ou cases à cocher directement sur la page (`CREATE_FORM_FIELD`) et remplir/aplatir les champs existants.

## Non-goals

- Édition vectorielle glyphe-par-glyphe de tracés Bézier arbitraires sans substitution de police standard/embarquée.
- OCR de documents purement scannés (prévu en Phase 5 post-MVP).

## Resource admission

- Budget d'images embarquées : `25 MiB` par image.
- Plafond de fusion / insertion : `512 MiB` cumulés.
- Historique `CommandLedger` borné à 200 commandes.
- Erreurs typées : `CannotDeleteLastPage`, `InvalidPageRange`, `ImageDecodeFailed`, `MergeBudgetExceeded`, `ExportSerializationFailed`.

## Verification

- Tester la détection/regroupement de blocs de texte existants (`groupTextRunsIntoBlocks`), l'édition, la suppression et le round-trip compilé (`compileEditedPdf`) avec ré-extraction du nouveau texte modifié.
- Tester `ADD_WHITEOUT`, `SET_WATERMARK`, `SET_HEADER_FOOTER`, `SET_PAGE_CROP`, `INSERT_BLANK_PAGE`, `ADD_LINK` et `CREATE_FORM_FIELD` en round-trip `compileEditedPdf -> PDFDocument.load`.
