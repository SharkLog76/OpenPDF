# Lecture de PDF (`viewer/pdf-reading`)

## Outcome and scope

Permettre l'ouverture, la validation, la navigation et la lecture haute fidélité de fichiers PDF locaux dans une interface proche d'Adobe Acrobat Pro, sans mutation du fichier source et avec une consommation mémoire bornée.

**ADR liée** : [Stack technique et moteurs PDF](../../../adr/architecture/stack-and-pdf-engine.md)

## Functional contract

1. **Admission et identité du document** :
   - Vérifier l'en-tête `%PDF-` (dans les 1024 premiers octets selon la norme PDF) et la taille avant chargement complet.
   - Calculer une identité déterministe (`DocumentId` basé sur SHA-256 des octets initiaux + taille + nom d'affichage séparé de l'identité).
   - Distinguer explicitement les états d'erreur via algèbre typée : `InvalidPdfHeader`, `FileTooLarge`, `PasswordRequired`, `IncorrectPassword`, `CorruptedXref`, `Cancelled`.
2. **Rendu paginé et virtualisé** :
   - Afficher uniquement les pages visibles dans le viewport (+ 1 à 2 pages de préchargement adjacent).
   - Supporter les modes d'affichage : page unique, défilement continu, double page (vue livre).
   - Supporter le zoom (25 % à 400 %, ajuster à la largeur, ajuster à la page) et la rotation d'affichage (0°, 90°, 180°, 270°) sans modifier le PDF source.
3. **Couche texte et recherche** :
   - Rendre une couche texte transparente alignée sur le canvas pour la sélection et la copie fidèle.
   - Fournir une recherche plein texte (insensible/sensible à la casse, surlignage des occurrences, compteur `i / N` et saut direct).
4. **Navigation latérale** :
   - Panneau de miniatures (thumbnails) générées à la demande et mises en cache avec éviction LRU.
   - Panneau de signets / table des matières (outlines PDF) et saut direct vers numéro de page.
   - Affichage des métadonnées observées du document (titre, auteur, créateur, version PDF, nombre de pages, statut de chiffrement, signatures existantes détectées).

## Non-goals (hors périmètre de cette brique)

- Toute modification persistante du document (couverte par `editor/pdf-modification`).
- L'OCR sur documents scannés sans couche texte (Phase 5 post-MVP).
- L'envoi de fichiers vers un serveur distant.

## Resource admission

- Plafond d'admission par défaut : `max_pdf_bytes = 256 MiB` (configurable, refus propre avec erreur typée au-delà).
- Cache de rendu bitmap/canvas borné (ex. max 12 pages haute résolution en mémoire simultanément ; éviction LRU hors viewport).
- Annulation coopérative (`AbortSignal`) lors d'un zoom rapide ou fermeture de document pour libérer immédiatement les tâches de rendu en cours.

## Verification

- Fixtures PDF réelles : PDF mono-page, multi-pages (>100 pages pour valider la virtualisation), PDF avec signets hiérarchiques, PDF chiffré par mot de passe, fichier non-PDF renommé `.pdf` (test rejet `%PDF-`), PDF tronqué.
- Vérifier que l'ouverture en lecture ne modifie aucun octet du fichier source (invariant SHA-256).
