# Contrats d'Interface, Modèles de Domaine et Catalogue d'Erreurs

Ce document détaille les structures de données pures, les quotas d'admission de sécurité et l'algèbre d'erreurs du projet **OpenPDF**.
Tout agent intervenant sur le code doit s'appuyer sur ces contrats immuables.

---

## 1. Couche Contrats (`src/contracts/`)

La couche Contrats définit les limites d'admission défensives, la validation de magic bytes et le catalogue d'erreurs d'entrée-sortie.

### 1.1 Limites d'Admission et Quotas (`src/contracts/schemas.ts`)

```typescript
export const ADMISSION_LIMITS = {
  MAX_PDF_BYTES: 256 * 1024 * 1024,        // 256 MiB — Budget max pour un fichier PDF ouvert
  MAX_MERGE_TOTAL_BYTES: 512 * 1024 * 1024,// 512 MiB — Budget cumulé pour une opération de fusion
  MAX_EMBED_IMAGE_BYTES: 25 * 1024 * 1024,  // 25 MiB  — Image insérée dans le document
  MAX_SIGNATURE_IMAGE_BYTES: 5 * 1024 * 1024,// 5 MiB   — Image de signature manuscrite/tampon
  MAX_CERT_BYTES: 1 * 1024 * 1024,          // 1 MiB   — Conteneur de certificat PKCS#12 (.pfx/.p12)
  MAX_RENDER_CACHE_PAGES: 12,              // 12 pages — Cache LRU des bitmaps de rendu
  MAX_LEDGER_HISTORY: 200,                  // 200 étapes — Historique max du CommandLedger (Undo/Redo)
} as const;
```

### 1.2 Validateurs de Magic Bytes

Les extensions de fichiers ne sont **jamais considérées comme fiables**. Tout binaire entrant est inspecté au niveau de ses premiers octets :

- **PDF (`validatePdfAdmission`)** : Recherche de la séquence `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`) dans les **1 024 premiers octets** (selon la spécification ISO 32000-1 pour tolérer les préambules d'en-tête). Vérifie également que la taille est non nulle et inférieure à 256 Mo.
- **Images (`detectImageFormat`)** :
  - **PNG** : `89 50 4E 47 0D 0A 1A 0A`
  - **JPEG** : `FF D8 FF`
  - **WebP** : En-tête `RIFF` avec sous-type `WEBP`
  - **SVG** : Détection XML racine `<svg` avec filtrage strict anti-XXE/XSS (`sanitizeSvgMarkup` : refus de `DOCTYPE`/`ENTITY`, `<script>`, `<foreignObject>`, attributs `on*` et références externes)
- **URLs d'annotations (`sanitizeSafeLinkUrl`)** : Autorisation exclusive des schémas `https:`, `http:` et `mailto:` sans identifiants intégrés (`user:pass@`), ni chemins UNC / contrôle.

### 1.3 Algèbre d'Erreurs Typées (`src/contracts/errors.ts`)

Toutes les erreurs sont strictement modélisées sous forme d'union discriminée avec champ `code` :

| Catégorie | Code d'Erreur | Signification & Contexte Déclencheur |
| :--- | :--- | :--- |
| **Viewer & Admission** | `InvalidPdfHeader` | En-tête `%PDF-` absent dans les 1024 premiers octets. |
| | `FileTooLarge` | Taille du fichier > 256 Mo. |
| | `EmptyFile` | Fichier de 0 octet. |
| | `PasswordRequired` | Document protégé par mot de passe utilisateur. |
| | `IncorrectPassword` | Mot de passe fourni invalide ou vide. |
| | `CorruptedPdf` | Structure cross-reference (xref) illisible ou objet manquant. |
| | `RenderCancelled` | Tâche de rendu annulée suite à un scroll rapide ou changement de page. |
| **Editor & Mutation** | `CannotDeleteLastPage` | Tentative de suppression de l'unique page restante. |
| | `InvalidPageRange` | Plage de pages inexistante ou syntaxe incorrecte (ex. "5-2" ou page 0). |
| | `ImageDecodeFailed` | Données d'image corrompues ou SVG actif/malveillant rejeté. |
| | `UnsafeUrl` | URL d'annotation hypertexte utilisant un protocole ou format interdit. |
| | `MergeBudgetExceeded` | Taille totale cumulée des documents à fusionner > 512 Mo. |
| | `ExportSerializationFailed`| Échec de sérialisation finale du flux PDF par `pdf-lib`. |
| **Save & Overwrite** | `OverwriteHandleUnavailable`| Aucun chemin ou handle fichier associé (nécessite "Enregistrer sous"). |
| | `OverwritePermissionDenied` | Droits en écriture insuffisants sur le fichier cible. |
| | `OverwriteFailed` | Échec de l'écriture atomique ou du renommage de staging. |
| **Signing & Vault** | `UnsupportedSignatureFileFormat` | Format d'image ou certificat non supporté. |
| | `SignatureImageTooLarge`| Image de signature > 5 Mo. |
| | `InvalidPkcs12Passphrase` | Mot de passe incorrect pour déverrouiller le `.pfx` / `.p12`. |
| | `InvalidPkcs12Container` | Fichier PKCS#12 corrompu ou absence de clé privée valide. |
| | `CertificateTooLarge` | Fichier de certificat > 1 Mo. |
| | `ByteRangeComputationFailed` | Calcul de la table `/ByteRange` du dictionnaire de signature échoué. |
| | `VaultStorageUnavailable` | Stockage local du trousseau inaccessible (IndexedDB / LocalStorage). |
| **Conversion & Export** | `ConversionFailed` | Échec lors de la génération DOCX, PPTX, XLSX ou archive image. |

---

## 2. Couche Domaine Pur (`src/domain/`)

### 2.1 Monade de Résultat (`src/domain/result.ts`)

```typescript
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T>;
export function err<E>(error: E): Err<E>;
export function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
export function isErr<T, E>(result: Result<T, E>): result is Err<E>;
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
```

### 2.2 Systèmes de Coordonnées & Conversions

Un point fondamental de l'éditeur est la coexistence de deux systèmes de coordonnées :

1. **Coordonnées Normalisées UI (`NormalizedRect`)** :
   - Origine `(0,0)` en **haut à gauche**.
   - Composantes `x, y, width, height` comprises strictement entre `0.0` et `1.0` relatives aux dimensions de la page.
   - Indépendant de la résolution, du zoom et de la densité de pixels de l'écran.
2. **Coordonnées PDF Natives (`PdfPointRect`)** :
   - Origine `(0,0)` en **bas à gauche**.
   - Unités en **points typographiques** (1 point = 1/72 de pouce).

#### Formule de conversion canonique :
```typescript
export function normalizedRectToPdfPoints(
  rect: NormalizedRect,
  pageWidthPt: number,
  pageHeightPt: number
): PdfPointRect {
  const width = Math.max(1, rect.width * pageWidthPt);
  const height = Math.max(1, rect.height * pageHeightPt);
  const x = rect.x * pageWidthPt;
  const y = pageHeightPt - rect.y * pageHeightPt - height; // Inversion de l'axe vertical Y
  return { x, y, width, height };
}
```

### 2.3 Modèle d'Édition (`src/domain/editor.ts`)

L'état d'édition (`EditorDocumentState`) est un objet **immuable** qui accumule toutes les mutations déclarées :

```typescript
export interface EditorDocumentState {
  readonly textOverlays: readonly TextOverlayItem[];    // Nouveaux blocs de texte
  readonly whiteouts: readonly WhiteoutItem[];          // Biffures / masquages (caviardage)
  readonly annotations: readonly AnnotationItem[];      // Surlignages, formes, notes
  readonly formFieldValues: Readonly<Record<string, string | boolean>>; // Valeurs de formulaires
  readonly pageRotations: Readonly<Record<number, DisplayRotation>>;    // Rotations additionnelles
  readonly pageOrder: readonly number[];                // Ordre réorganisé des pages
  readonly deletedPageIndices: readonly number[];       // Pages supprimées
  readonly watermarks: readonly WatermarkItem[];        // Filigranes
  readonly headersFooters: readonly HeaderFooterItem[]; // En-têtes et pieds de page
  readonly pageCrops: Readonly<Record<number, NormalizedRect>>; // Rogpages
}
```

#### Commandes supportées (`EditCommand`) :
Toutes les commandes d'édition sont des actions typées enregistrées dans le CommandLedger :
- `AddText`, `UpdateText`, `DeleteText`
- `AddWhiteout`, `DeleteWhiteout`
- `AddAnnotation`, `DeleteAnnotation`
- `SetFormFieldValue`
- `SetPageRotation`, `ReorderPages`, `DeletePage`
- `AddWatermark`, `SetHeaderFooter`, `SetPageCrop`

### 2.4 Modèle de Signature Numérique (`src/domain/signing.ts`)

- **`VisualSignatureAsset`** : Actif visuel (tampon, griffe manuscrite, texte calligraphié) stocké au format Data URL (PNG/SVG).
- **`SignaturePlacement`** : Positionnement d'un sceau sur une page donnée (`NormalizedRect`), avec motifs légaux (`reason`), lieu (`location`) et horodatage.
- **`CertificateMetadata`** : Données extraites du certificat X.509 (Sujet, Émetteur, validité, empreinte SHA-256, statut auto-signé).
- **`SignatureVerificationRecord`** : Résultat de vérification d'une signature existante (`signerName`, `signingTime`, `integrityStatus: 'valid' | 'corrupted' | 'unverified'`).

### 2.5 Modèle Multi-Onglets (`src/domain/workspaceTabs.ts`)

Gère l'espace de travail avec plusieurs documents ouverts en parallèle :
- **`DocumentTabState`** :
  - `tabId`: Identifiant unique de l'onglet.
  - `filePath`: Chemin système absolu (si connu).
  - `isDirty`: Indicateur de modifications non sauvegardées.
  - `activePageIndex`: Numéro de page courante.
  - `zoomLevel`: Facteur de zoom (ex: 1.0, 1.5).
  - `ledgerRevision`: Compteur de révision incrémenté à chaque commande.
