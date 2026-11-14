# Ajout de fichiers signatures (`signing/pdf-signature`)

## Outcome and scope

Permettre à l'utilisateur d'importer, de gérer et d'appliquer des **fichiers signatures** sur un document PDF :
1. **Signatures visuelles** (fichiers image `.png`, `.svg`, `.webp`, `.jpg`, tracé manuscrit dessiné, ou tampon typographique) incrustées proprement dans le document.
2. **Signatures numériques cryptographiques** via fichiers de certificats locaux (`.pfx` / `.p12`, ou certificat auto-signé généré localement pour les tests/usages internes) conformes aux champs de signature PDF (`/ByteRange`, PKCS#7 / CMS SHA-256).

**ADR liée** : [Stack technique et moteurs PDF](../../../adr/architecture/stack-and-pdf-engine.md)  
**Dépendance** : [Modification de PDF](../../editor/pdf-modification/spec.md)

## Functional contract

1. **Coffre local de fichiers signatures (`SignatureVault`)** :
   - Importer un fichier signature visuel (`.png`, `.svg`, `.webp`, `.jpg`) avec validation de format (magic bytes), normalisation de transparence (suppression optionnelle de fond uni blanc pour les scans papier) et calcul d'empreinte SHA-256.
   - Créer une signature manuscrite au stylet/souris (exportée en SVG/PNG vectorisé) ou typographique (nom + police manuscrite).
   - Importer un fichier certificat numérique (`.pfx` / `.p12`) avec saisie sécurisée de la phrase secrète (jamais persistée en clair ni journalisée) et extraction des métadonnées observées du certificat (CN, émetteur, validité `notBefore`/`notAfter`, empreinte).
2. **Positionnement et paramétrage sur le document** :
   - Glisser-déposer et redimensionner le bloc de signature sur n'importe quelle page du PDF (et optionnellement sur toutes les pages pour un paraphe).
   - Associer des métadonnées visuelles optionnelles autour de l'image de signature : nom du signataire, date/heure ISO locale, lieu, motif ("Lu et approuvé", "Certifié conforme", etc.).
3. **Modes d'application (deux niveaux explicites)** :
   - **Signature visuelle / Paraphe (Flatten Visual Stamp)** : incruste le fichier signature dans le contenu de la page (sans prétendre être une signature cryptographique).
   - **Signature électronique certifiée (Cryptographic PKCS#7)** : crée un dictionnaire `/Sig` + widget `/Annot` avec réservation d'espace `/ByteRange`, calcul du condensat SHA-256 sur les octets du document, signature CMS PKCS#7 via la clé privée du fichier `.pfx`/`.p12`, et injection dans `/Contents`.
4. **Vérification transparente des signatures existantes (Observations vs Unknowns)** :
   - Inspecter tout PDF signé ouvert : vérifier le `/ByteRange` et la validité mathématique du condensat (document intact vs modifié après signature) et afficher explicitement le statut de confiance de l'émetteur (Certificat valide, Expiré, Auto-signé, ou **Unknown** si l'autorité de certification racine n'est pas vérifiable localement).

## Non-goals (hors périmètre de cette brique)

- Horodatage qualifié TSA externe (RFC 3161) ou révocation en ligne OCSP/CRL nécessitant des appels réseau tiers (envisageable en Phase 5 optionnelle).
- Intégration de cartes à puce matérielles PKCS#11 / HSM USB en MVP.

## Resource admission & Security invariants

- Budget d'admission fichier signature image : `max_signature_image_bytes = 5 MiB` (dimensions max `4096 x 4096`).
- Budget d'admission fichier certificat `.pfx`/`.p12` : `max_cert_bytes = 1 MiB`.
- **Zero Secret Persistence** : les clés privées et mots de passe `.pfx`/`.p12` restent uniquement en mémoire vive le temps de l'opération de signature et sont explicitement effacés/zéroïsés ensuite. Aucun log ne doit contenir de mot de passe ou clé privée.
- Erreurs typées : `UnsupportedSignatureFileFormat`, `SignatureImageTooLarge`, `InvalidPkcs12Passphrase`, `ExpiredCertificate`, `ByteRangeComputationFailed`, `TamperedDocumentSignature`.

## Verification

- Importer un fichier signature `.png` transparent et un `.svg`, les placer sur un PDF multi-pages, exporter et vérifier le rendu visuel fidèle.
- Signer un PDF avec un certificat de test `.p12` généré localement, puis ré-ouvrir le PDF signé et vérifier :
  1. Que la vérification `/ByteRange` retourne `Intact / Valid`.
  2. Qu'une modification ultérieure d'un seul octet hors `/Contents` déclenche `TamperedDocumentSignature`.
  3. Que les journaux et le stockage local ne contiennent jamais le mot de passe du `.p12`.
