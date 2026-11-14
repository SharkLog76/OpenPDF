# Tasks — Ajout de fichiers signatures (`signing/pdf-signature`)

- [x] Modéliser les types domaine de signature visuelle, certificat X.509 et résultat de vérification (`Observations` / `Derivations` / `Unknowns`).
- [x] Créer les contrats de validation magic bytes PNG/SVG/JPEG/WebP et budgets d'admission.
- [x] Implémenter la normalisation et le détourage des fichiers signatures (`.png`, `.svg`, `.jpg`, `.webp`) + pad de signature manuscrite + tampon typographique.
- [x] Implémenter l'adaptateur cryptographique PKCS#12 / PKCS#7 (`/ByteRange`, SHA-256, CMS) et le vérificateur de signatures existantes.
- [x] Construire le coffre de signatures chiffré AES-GCM (`SignatureVaultStore` sur `IndexedDB`) et l'UI de placement + métadonnées visuelles (date, motif, paraphe multi-pages).
- [x] Tester avec un certificat `.p12` généré, vérifier la détection de falsification (`tampered`) et consigner dans `verification.md`.
