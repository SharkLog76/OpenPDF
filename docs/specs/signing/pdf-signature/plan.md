# Plan — Ajout de fichiers signatures (`signing/pdf-signature`)

1. Modéliser dans `src/domain/signing/` les entités : `VisualSignatureAsset`, `CertificateMetadata`, `SignaturePlacement`, `SignedDocumentOutcome`, `SignatureVerificationResult` (`Intact`, `Tampered`, `UnknownIssuer`), `SigningError`.
2. Définir dans `src/contracts/signing.ts` les contrats d'import de fichier signature, d'application visuelle, de signature PKCS#7 et de vérification.
3. Implémenter `src/providers/crypto/` :
   - Normalisation d'images signatures (validation magic bytes PNG/SVG/JPEG/WebP, détourage optionnel du fond blanc sur canvas hors-écran, redimensionnement borné).
   - Parser PKCS#12 (`.pfx`/`.p12`), création de `/ByteRange` et signature CMS PKCS#7 SHA-256, ainsi que vérification `/ByteRange` + digest sur PDF signés.
4. Implémenter `src/application/signing/` (`SignatureVault` pour les fichiers signatures visuels en stockage local, workflow `SignDocumentWorkflow` et `VerifySignaturesWorkflow`).
5. Construire l'UI dans `src/adapters/ui/signing/` (bibliothèque de signatures, import de fichier `.png`/`.svg`/`.pfx`, pad de dessin manuscrit, placement interactif avec poignées, panneau de vérification des signatures).
6. Exécuter les tests de bout en bout (signature visuelle, signature `.p12`, détection de falsification, absence de fuite de secret) et consigner dans `verification.md`.
