# Repository Guidelines — OpenPDF (REA Methodology)

## Product and Authority

OpenPDF is a local-first PDF editor and signer designed as a modular, modern alternative to Adobe Acrobat Pro. All document inspection, rendering, editing, and cryptographic signing run locally on the user's machine.

Follow the **REA (Reverse Engineer Anything)** engineering discipline:

- Distinguish **observations** (verified PDF bytes, object streams, signatures, rendered pixels), **derivations** (parsed page tree, form schema, X.509 chain), **inferences** (heuristic text flow or layout grouping), and **unknowns** (unsupported PDF extensions, corrupted cross-reference tables, unverified root CAs).
- Preserve source document integrity: never mutate the caller's input PDF file in place without explicit user save/export action and atomic staging.
- Fail-closed integration: do not implement or integrate capabilities while material scope, authority, side-effect, or verification questions remain unresolved.
- Additive & non-intrusive setup: configuration changes must be additive and idempotent, with backups. Never silently install or upgrade unrelated system runtimes (Node.js, .NET, Java, etc.) without explicit user approval.
- Redact sensitive material (private keys, PFX/P12 passphrases, certificate secrets) from logs, telemetry, and persisted state.

---

## Mode Projet, Traçabilité & Réversibilité (Obligatoire)

Toute intervention sur le dépôt doit respecter le cadre de gouvernance opérationnel décrit dans [docs/governance/project-rules.md](docs/governance/project-rules.md) :

1. **Enregistrement de la Demande** : Chaque demande formulée par l'utilisateur est consignée dans le [Registre de Traçabilité](docs/governance/traceability-ledger.md) (`docs/governance/traceability-ledger.md`) avec un identifiant unique `REQ-YYYYMMDD-XX`, son périmètre et ses critères d'acceptation.
2. **Point de Restauration & Réversibilité** : Avant toute modification de code, noter le commit de référence (`BASE_COMMIT`). Chaque modification doit être strictement réversible via une commande documentée (`git revert`, `git restore` ou suppression de branche).
3. **Maintien du Référentiel Documentaire** : Si une modification touche un contrat, un modèle ou un processus, la documentation d'architecture correspondante (`docs/architecture/`) doit être mise à jour dans le même commit.
4. **Synchronisation avec le NAS** : À la fin de chaque demande validée et testée, les commits doivent être poussés sur le dépôt Git bare du NAS :
   ```powershell
   git push origin main
   ```

---

## Économie de Tokens & Consultation du Référentiel

Pour préserver le contexte et éviter toute consommation inutile de tokens :

- **Consultation de l'Index Technique en premier** : Avant de lire un fichier source, consulter systématiquement l'[Index d'Orientation Technique](docs/architecture/index.md) (`docs/architecture/index.md`).
- **Interdiction de relire la totalité des programmes** : Ne jamais exécuter de lecture globale de fichiers non ciblés. Utiliser les guides détaillés par processus ([docs/architecture/processes-and-workflows.md](docs/architecture/processes-and-workflows.md)) et cibler les plages de lignes exactes avec `read_file`.

---

## Architecture and Cleanup

Dependencies flow strictly inward:

`Adapters (UI Shell, File Dialogs, CLI)` → `Application (Session, Command Ledger / Undo-Redo, Export Pipeline)` → `Contracts (Typed Schemas, Error Catalog)` → `Providers (PDF Renderer, PDF Mutator, Crypto/Signature Engine, Bounded FileSystem)` → `Domain (Pure PDF Models, Page Tree, Edit Commands, Signature Envelope, Result<T, E>)`

- Keep engine/library-specific APIs (`pdfjs-dist`, `pdf-lib`, `PDFium`, `node-forge`, etc.) strictly inside `Providers`, never inside `Domain` or `Application`.
- See [docs/architecture/architecture.mermaid](docs/architecture/architecture.mermaid) and [docs/architecture/overview.md](docs/architecture/overview.md) before altering module boundaries.
- **Single Canonical Owner**: Give each format and resource a single owner that parses and normalizes unknown boundary values once using format-aware parsers and tagged errors (`Result<T, DomainError>`). Downstream consumers use the owner's normalized facts rather than re-parsing raw bytes.
- **Lifecycle Ownership**: Own opened document handles, worker threads, canvas/bitmap caches, and temporary export staging files explicitly. Ensure cancellation, cleanup retry, and safe disposal on document close.
- **No Speculative Complexity**: Explain concrete failure modes, likelihood, and complexity cost to the user before adding intricate locking or edge-case machinery.
- **Root-Cause Fixes**: When fixing a bug, inspect the producing boundary and sibling consumers for duplicated interpretation; remove superseded representations in the same change.

---

## Performance & Resource Admission

Design workflows for efficiency and bounded resource consumption from the first implementation:

1. **Responsive UX & Agent Context**: Minimize redundant work, avoid blocking the UI thread, and expose clear, structured errors and progress states.
2. **Render & Parse Latency**: Reuse validated parse trees and page render caches with explicit invalidation keys (document digest + page index + zoom + rotation + mutation revision).
3. **CPU & Memory Bounds**: Admit PDF inputs and signature files against explicit byte and page-count budgets before allocation (256 Mo pour un PDF, 5 Mo pour une signature, 1 Mo pour un certificat).

---

## Development & Feature Lifecycle

Documentation ownership and authoring conventions live in [docs/development/documentation.md](docs/development/documentation.md).

- **Spec-First Rule**: Create `docs/specs/<domain>/<feature-slug>/` before writing application code.
- Record isolated architectural decisions in `docs/adr/<domain>/<decision-slug>.md` using Michael Nygard sections (`Status`, `Context`, `Decision`, `Consequences`).
- Use Conventional Commit subjects (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

---

## Verification and Claims

- Validate boundary inputs with malformed, encrypted, truncated, and high-page-count PDF fixtures alongside valid signature files (`.png`, `.svg`, `.pfx`, `.p12`).
- Report only checks actually executed after the final edit; explicitly separate verified behavior from unverified targets or simulated mocks.
- Never commit certificates with real private keys, user documents, build artifacts (`dist/`, `build/`, `bin/`, `obj/`), `node_modules/`, or temporary files.
