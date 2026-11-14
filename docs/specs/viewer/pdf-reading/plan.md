# Plan — Lecture de PDF (`viewer/pdf-reading`)

1. Définir dans `src/domain/viewer/` les modèles purs : `DocumentIdentity`, `PageMetrics`, `ViewportState`, `SearchMatch`, `OutlineNode`, `ViewerError`.
2. Définir dans `src/contracts/viewer.ts` les schémas d'entrée/sortie et contrats d'erreur pour l'ouverture, le rendu de page et la recherche.
3. Implémenter `src/providers/filesystem/` (lecture bornée, vérification `%PDF-`, SHA-256) et `src/providers/renderer/` (adaptateur PDF avec annulation par `AbortSignal` et extraction de couche texte/outlines).
4. Implémenter `src/application/session/` (cycle de vie du document ouvert, cache LRU borné, invalidation sur changement de zoom/rotation) et `src/application/viewer/` (virtualisation et recherche).
5. Implémenter les composants UI dans `src/adapters/ui/viewer/` (barre d'outils lecture, panneau latéral miniatures/signets, zone de rendu virtualisée).
6. Exécuter les tests unitaires, tests de frontières malformées/chiffrées et benchmarks de virtualisation.
