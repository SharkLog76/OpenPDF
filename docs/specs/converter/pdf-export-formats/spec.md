# Export Multi-Formats (Word, Excel, PowerPoint, Images, HTML, Texte) (`converter/pdf-export-formats`)

## Outcome and scope

Permettre l'exportation locale d'un document PDF actif (y compris ses modifications non encore sauvegardées sur disque) vers les formats bureautiques et web courants comme dans Adobe Acrobat Pro : **Microsoft Word (`.docx`)**, **Microsoft Excel (`.xlsx` et `.csv`)**, **Microsoft PowerPoint (`.pptx`)**, **Images (`PNG` / `JPEG`, archive `.zip` si multi-pages)**, **HTML autonome (`.html`)** et **Texte brut (`.txt`)**, en respectant la traçabilité REA (Observations / Dérivations / Inférences / Inconnues).

## Functional contract

1. **Formats supportés (`src/domain/converter.ts`)** :
   - `docx` : document Word OOXML généré localement (titres inférés par taille relative de police, paragraphes regroupés par proximité verticale, tableaux géométriques détectés, sauts de page, et intégration automatique d'une capture image haute résolution pour toute page sans texte extractible).
   - `xlsx` et `csv` : extraction des grilles et lignes tabulaires par regroupement géométrique `(baselineY, colonne X)` — une feuille par page PDF dans `.xlsx` (plus feuille `Synthèse`), typage automatique nombre/texte et style d'en-tête ; export CSV UTF-8 BOM séparateur `;`.
   - `pptx` : présentation PowerPoint OOXML respectant les proportions exactes des pages PDF en EMU, avec choix :
     - *Diapositives éditables* (`editable-text`) : zones de texte positionnées proportionnellement aux coordonnées PDF + fallback capture image pour pages sans texte ;
     - *Diapositives visuelles haute fidélité* (`visual-slides`) : rendu haute résolution par diapositive accompagné des textes extraits en notes de l'orateur.
   - `png` / `jpeg` : rendu haute résolution (`150 DPI` ou `300 DPI`) de la page active ou de toutes les pages (archive `.zip` si > 1 page).
   - `html` / `txt` : document HTML autonome (styles CSS intégrés + images pour pages scannées) et extraction texte linéaire paginée.
2. **Séparation stricte REA** :
   - Chaque conversion produit un `ConversionAuditReport` distinguant :
     - **Observations** : pages analysées, nombre d'éléments texte PDF.js, pages sans texte ;
     - **Dérivations** : paragraphes, tableaux, diapositives ou images générés ;
     - **Inconnues** : avertissement explicite si certaines pages sont purement scannées/vectorielles (requièrent OCR pour texte éditable).
3. **Intégration UI & Sauvegarde** :
   - Modale dédiée `ExportFormatsModal` accessible depuis `Fichier > Exporter vers…`, le ruban et `Tous les outils`.
   - En mode Tauri : dialogue natif Enregistrer + écriture atomique (`write_binary_file_atomic`) ; en mode navigateur : téléchargement Blob proprement révoqué.

## Non-goals

- OCR neuronal sur images scannées (signalé explicitement en Inconnue dans le rapport, avec repli visuel haute résolution dans Word/PowerPoint/HTML).
- Envoi vers un service cloud de conversion.

## Resource admission

- Plafond de sortie binaire fixé à 256 MiB (`MAX_EXPORT_BYTES_HARD_LIMIT`), rendu coopératif page par page avec cession asynchrone du thread UI et borne DPI (`72..300`) pour éviter la saturation RAM WebView2.

## Verification

- Tests unitaires purs sur la détection de paragraphes, titres et colonnes/lignes tabulaires, et validation structurelle ZIP/XML des fichiers générés `.docx`, `.xlsx`, `.pptx`, `.csv`, `.html`, `.txt` (`tests/converter-export.test.ts`).
