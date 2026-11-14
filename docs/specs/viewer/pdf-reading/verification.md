# Verification — Lecture de PDF (`viewer/pdf-reading`)

*Date : 2026-11-13 · Runtime : Node.js v26.13.1 / Vitest 3.2.7 (`jsdom`) / TypeScript 5.9.2 / Vite 7.3.8*

## Vérifications exécutées

- **`tests/viewer-reading.test.ts` (5/5 tests passés)** :
  - Admission du PDF de démonstration multi-pages généré (`createSamplePdfBytes`), calcul d'empreinte SHA-256 déterministe (64 caractères hex), et vérification que les octets source restent strictement inchangés.
  - Détection des champs `AcroForm` (`signer_full_name`, `approved_terms`).
  - Rejet `EmptyFile` sur 0 octet, `InvalidPdfHeader` sur fichier texte renommé `.pdf`, et `FileTooLarge` au-delà du plafond d'admission (`256 MiB` par défaut).
  - Bornage déterministe de `clampZoom` et `rotateDisplayCW`.
- **`npm run build` (`tsc --noEmit && vite build`)** : compilation TypeScript stricte sans erreur et bundle production généré (avec `pdf.worker.min.mjs`).

## Limites de couverture et éléments non vérifiés

- Le rendu canvas effectif de `pdfjs-dist` via Web Worker, la virtualisation `IntersectionObserver` sur un document >100 pages, le déverrouillage interactif par mot de passe et la sélection de texte dans un navigateur réel n'ont pas encore été testés via Playwright / navigateur réel.
