# OpenPDF Documentation

Index canonique de la documentation du projet **OpenPDF**, structuré selon la méthodologie **REA (Reverse Engineer Anything)** et le cadre de gouvernance en mode projet.

---

## 1. Gouvernance Projet, Traçabilité & Réversibilité

- [Règles de Gestion de Projet](governance/project-rules.md) : Workflow en 5 étapes pour chaque demande, matrice de réversibilité, sauvegardes et synchronisation avec le dépôt bare NAS.
- [Registre de Traçabilité des Demandes](governance/traceability-ledger.md) : Journal chronologique de toutes les demandes utilisateur avec points de restauration et statut.

---

## 2. Référentiel d'Architecture (Navigation Zéro-Token)

Pour éviter la relecture de fichiers sources volumineux et économiser les tokens d'inférence, utilisez l'index et les guides détaillés :

- [Index d'Orientation Technique (Zéro-Token)](architecture/index.md) : Matrice d'aiguillage rapide vers les modules cibles et plages de lignes.
- [Vue Globale de l'Architecture](architecture/overview.md) : Philosophie locale, pile technique (Tauri v2, React 19, Rust), couches concentriques et principes directeurs.
- [Contrats, Modèles de Domaine & Catalogue d'Erreurs](architecture/contracts-and-domain.md) : Budgets d'admission, validateur magic bytes, coordonnées normalisées [0..1] vs points PDF, algèbre `DomainError`.
- [Modules Applicatifs & Fournisseurs Techniques](architecture/modules-and-providers.md) : Détail des Providers (`pdfJsRenderer`, `pdfLibMutator`, `signatureProvider`, `boundedFileSystem`, convertisseurs) et services applicatifs.
- [Processus Métier de Bout en Bout](architecture/processes-and-workflows.md) : Algorithmes pas à pas pour l'ouverture, le rendu, l'édition, la réorganisation de pages, la signature PKCS#7, la sauvegarde atomique, l'export et le multi-onglets.
- [Composants UI & Arbre d'État](architecture/ui-components-and-state.md) : Décomposition d'`App.tsx`, composants de l'interface graphique et gestion centralisée des états.
- [Diagramme de Flux Architectural](architecture/architecture.mermaid) : Vue graphique Mermaid des dépendances strictes.

---

## 3. Spécifications Fonctionnelles & Historique

- [AGENTS.md](../AGENTS.md) : Directives générales pour l'agent et règles de préservation d'intégrité.
- [ROADMAP.md](../ROADMAP.md) : Ordonnancement des phases MVP et post-MVP.
- [Architectural Decision Records (ADR)](adr/README.md) : Décisions techniques isolées (choix de stack, moteurs PDF).
- [Feature Specifications](specs/README.md) : Spécifications, plans, tâches et journaux de vérification par brique fonctionnelle (`viewer`, `editor`, `signing`, `converter`, `shell`, `host`).
- [Documentation Ownership](development/documentation.md) : Règles d'écriture et cycle de vie `spec.md` / `plan.md` / `tasks.md` / `verification.md`.
