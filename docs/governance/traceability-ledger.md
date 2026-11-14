# Registre de Traçabilité des Demandes (Traceability Ledger)

Ce registre consigne chronologiquement l'ensemble des demandes utilisateurs exécutées sur le projet **OpenPDF**. Il garantit la traçabilité de chaque évolution, les points de restauration associés et les modalités de réversibilité.

---

## Index des Demandes

| ID Demande | Date | Titre / Objet | Statut | Point de Restauration | Fichiers Impactés |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-20261114-01** | 2026-11-14 | Initialisation Git et push sur dépôt bare NAS | COMPLÉTÉ | Commit initial (`76784e5`) | Dépôt entier |
| **REQ-20261114-02** | 2026-11-14 | Mise en place de la gouvernance projet & documentation d'architecture détaillée | COMPLÉTÉ | `76784e5` | `docs/`, `AGENTS.md` |
| **REQ-20261114-03** | 2026-11-14 | Intégration de la licence GPL-3.0 et synchronisation bi-directionnelle avec GitHub | COMPLÉTÉ | `0b552a9` | `LICENSE`, `package.json`, remotes |

---

## Détail des Demandes

### REQ-20261114-01 : Initialisation Git et déploiement du dépôt bare NAS
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 04:21
- **Besoin** : Création d'un dépôt Git bare sur le Synology NAS (`/volume2/Developpement/OpenPDF.git`) accessible via SSH (port 5123) et premier push du code local.
- **Périmètre & Fichiers** :
  - NAS : `/volume2/Developpement/OpenPDF.git`
  - Local : Initialisation `main`, exclusion `.gitignore`, liaison `origin ssh://developpement@anoury.synology.me:5123/volume2/Developpement/OpenPDF.git`
- **Point de Restauration / Réversibilité** :
  - Commit SHA : `76784e5` (`feat: initial commit for OpenPDF`)
  - Commande de rollback : Suppression de `origin` en local (`git remote rm origin`) et suppression du dossier bare sur le NAS (`ssh ... rm -rf /volume2/Developpement/OpenPDF.git`).
- **Résultat de Vérification** :
  - `git push -u origin main` réussi.
  - Vérification distante : `HEAD` pointé sur `refs/heads/main` avec le commit `76784e5`.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-03 : Intégration de la licence GPL-3.0 et synchronisation bi-directionnelle GitHub
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 04:45
- **Besoin** :
  1. Résoudre le rejet de push sur `https://github.com/alexandrenoury/OpenPDF.git` dû au commit initial créé par GitHub.
  2. Intégrer la licence officielle GNU GPL v3.0 dans l'arbre local et mettre à jour `package.json`.
  3. Pousser simultanément sur le dépôt bare du NAS et sur GitHub.
- **Périmètre & Fichiers** :
  - `LICENSE`
  - `package.json`
  - `.git/config` (remotes `origin` et `github`)
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `0b552a9`
  - Commande de rollback si nécessaire : `git reset --hard 0b552a9`
- **Résultat de Vérification** :
  - Fusion sans conflit de `github/main` (commit `59348c5`) avec `main`.
  - Tests unitaires et typecheck vérifiés.
  - Push synchronisé sur le NAS (`origin`) et GitHub (`github`).
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-02 : Documentation d'architecture détaillée et règles de gestion en mode projet
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 04:26
- **Besoin** :
  1. Produire une documentation d'architecture ultra-détaillée évitant la surconsommation de tokens lors des futures demandes.
  2. Fournir une documentation précise des processus, contrats, flux et composants pour éliminer le besoin de relecture globale du code source.
  3. Définir les règles de gestion en mode projet avec traçabilité systématique et garantie de réversibilité.
- **Périmètre & Fichiers** :
  - `docs/governance/project-rules.md`
  - `docs/governance/traceability-ledger.md`
  - `docs/architecture/index.md`
  - `docs/architecture/overview.md`
  - `docs/architecture/contracts-and-domain.md`
  - `docs/architecture/modules-and-providers.md`
  - `docs/architecture/processes-and-workflows.md`
  - `docs/architecture/ui-components-and-state.md`
  - `AGENTS.md` (mise à jour des règles d'ingénierie et gouvernance)
  - `docs/README.md` (mise à jour des pointeurs)
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `76784e5`
  - Commande de rollback si nécessaire : `git revert HEAD` ou `git checkout 76784e5 -- docs/ AGENTS.md`
- **Résultat de Vérification** :
  - Validation croisée du contenu avec le code source existant.
  - Exécution des tests unitaires (`npm.cmd test`).
  - Validation de la compilation TypeScript (`npx.cmd tsc --noEmit`).
  - Push du commit sur le NAS.
- **Statut** : **COMPLÉTÉ**

---

### REQ-20261114-03 : Intégration de la licence GPL-3.0 et synchronisation bi-directionnelle GitHub
- **Demandeur** : Utilisateur
- **Date** : 14/11/2026 04:45
- **Besoin** :
  1. Résoudre le rejet de push sur `https://github.com/alexandrenoury/OpenPDF.git` dû au commit initial créé par GitHub.
  2. Intégrer la licence officielle GNU GPL v3.0 dans l'arbre local et mettre à jour `package.json`.
  3. Pousser simultanément sur le dépôt bare du NAS et sur GitHub.
- **Périmètre & Fichiers** :
  - `LICENSE`
  - `package.json`
  - `.git/config` (remotes `origin` et `github`)
- **Point de Restauration / Réversibilité** :
  - Commit de référence : `0b552a9`
  - Commande de rollback si nécessaire : `git reset --hard 0b552a9`
- **Résultat de Vérification** :
  - Fusion sans conflit de `github/main` (commit `59348c5`) avec `main`.
  - Tests unitaires et typecheck vérifiés.
  - Push synchronisé sur le NAS (`origin`) et GitHub (`github`).
- **Statut** : **COMPLÉTÉ**
