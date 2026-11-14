# Verification — Ajout de fichiers signatures (`signing/pdf-signature`)

*Date : 2026-11-13 · Runtime : Node.js v26.13.1 / Vitest 3.2.7 (`jsdom`) / TypeScript 5.9.2 / Vite 7.3.8*

## Vérifications exécutées

- **`tests/signing-pkcs7.test.ts` (3/3 tests passés)** :
  - Validation des magic bytes (`detectImageFormat`) pour PNG et SVG, et rejet `UnsupportedSignatureFileFormat` sur contenu invalide.
  - Chiffrement / déchiffrement WebCrypto `AES-GCM 256` (`encryptAssetPayload` / `decryptAssetPayload`) d'un asset signature PNG.
  - Incrustation de signature visuelle multi-pages (paraphe avec cartouche métadonnées) + génération locale de certificat `.p12` (`generateSelfSignedPkcs12`) + rejet `InvalidPkcs12Passphrase` sur mauvais mot de passe + signature cryptographique détachée PKCS#7 `/ByteRange` SHA-256 (`signPdfWithPkcs12`).
  - Vérification cryptographique (`verifyPdfSignatures`) retournant `status: 'intact'`, `subFilter: 'adbe.pkcs7.detached'`, `subjectCommonName: 'Alexandre Martin'` et liste explicite d'`unknowns`.
  - Test de falsification : altération d'un octet dans la plage signée détectée immédiatement (`status: 'tampered'`).
- **`npm run build` (`tsc --noEmit && vite build`)** : compilation et bundle sans erreur.

## Limites de couverture et éléments non vérifiés

- Le stockage `IndexedDB` complet (`SignatureVaultStore`) et le détourage canvas sur images réelles (`.png`, `.svg`, `.jpg`, `.webp`) nécessitent un navigateur réel pour vérification E2E.
- La vérification visuelle et cryptographique du PDF signé dans Adobe Acrobat DC n'a pas été exécutée automatiquement dans cette session.
