# Guide de Signature de Code avec SignPath Foundation (Open Source)

Ce document détaille la procédure complète pour faire certifier et signer numériquement les installeurs Windows d'**OpenPDF** via **SignPath Foundation**, afin que Microsoft Defender SmartScreen accepte l'application sans avertissement.

---

## 1. Pourquoi SignPath Foundation ?

- **Gratuit pour l'Open Source** : SignPath Foundation finance et prend en charge les certificats de signature de code Authenticode pour les projets sous licence libre (GPL, MIT, Apache).
- **Zéro token USB matériel requis** : La clé privée est protégée dans un HSM cloud certifié FIPS 140-2 géré par SignPath.
- **Réputation SmartScreen** : Les exécutables signés par l'autorité de la fondation SignPath bénéficient de la réputation de l'organisation, supprimant l'écran d'alerte rouge/bleu de Windows Defender.
- **Intégration GitHub Actions** : La signature s'exécute automatiquement lors de chaque publication de version (`git push origin v*`).

---

## 2. Étape 1 : Déposer la candidature auprès de la Fondation (5 minutes)

1. Rendez-vous sur la page officielle : **[https://signpath.org/apply.html](https://signpath.org/apply.html)**.
2. Remplissez le formulaire de candidature avec les informations suivantes :
   - **Project Name** : `OpenPDF`
   - **Project Website / Repository** : `https://github.com/SharkLog76/OpenPDF`
   - **License** : `GNU General Public License v3.0 (GPL-3.0)`
   - **Project Description** : `Local-first, modular PDF editor, viewer and cryptographic signer built with Tauri v2, Rust and React.`
   - **Download URL** : `https://github.com/SharkLog76/OpenPDF/releases/latest`
   - **Contact Email** : Votre adresse email (ou votre adresse `206803949+SharkLog76@users.noreply.github.com`).
3. Soumettez le formulaire. La validation par l'équipe SignPath Foundation prend généralement entre **24h et 48h**.

---

## 3. Étape 2 : Configuration du compte SignPath

Dès validation de votre projet par SignPath :
1. Connectez-vous sur **[https://signpath.io](https://signpath.io)** avec votre compte GitHub **SharkLog76**.
2. Créez votre organisation (ex: `openpdf-project` ou `SharkLog76`).
3. Liez votre dépôt `SharkLog76/OpenPDF`.
4. Configurez la politique de signature (*Signing Policy*) :
   - Créez une politique nommée `release-signing` autorisant la signature sur les tags `v*`.
5. Notez les 4 identifiants fournis par SignPath :
   - **Organization ID** : L'identifiant de votre organisation SignPath.
   - **Project Slug** : Le slug de votre projet (ex. `openpdf`).
   - **Signing Policy Slug** : Le slug de la politique (ex. `release-signing`).
   - **API Token** : Le jeton secret d'API pour GitHub Actions.

---

## 4. Étape 3 : Enregistrement des Secrets sur GitHub

Dans votre dépôt GitHub (`https://github.com/SharkLog76/OpenPDF`) :
1. Allez dans **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**.
2. Dans **Repository secrets** (cliquez sur *New repository secret*) :
   - Nom : `SIGNPATH_API_TOKEN`
   - Valeur : *[Votre API Token SignPath]*
3. Dans **Repository variables** (onglet *Variables* $\rightarrow$ *New repository variable*) :
   - `SIGNPATH_ORGANIZATION_ID` : *[Votre Organization ID]*
   - `SIGNPATH_PROJECT_SLUG` : *[Votre Project Slug]*
   - `SIGNPATH_SIGNING_POLICY_SLUG` : *[Votre Signing Policy Slug]*

---

## 5. Fonctionnement du Pipeline Automatisé

Le workflow GitHub Actions ([.github/workflows/release.yml](file:///c:/Users/Alexandre/Desktop/Developpements/OpenPDF/.github/workflows/release.yml)) est conçu de manière hybride et résiliente :

1. **Compilation** : Rust & Tauri compilent l'installeur NSIS (`.exe`) et le package (`.msi`).
2. **Détection automatique de SignPath** :
   - **Si le secret `SIGNPATH_API_TOKEN` est configuré** : L'action officielle `signpath/github-action-submit-signing-request@v3` soumet les binaires à SignPath, attend le scellement HSM et récupère les fichiers signés.
   - **Si le secret n'est pas encore configuré** (en attente de validation) : Le workflow publie les binaires normalement sans bloquer la CI.
3. **Publication** : La release GitHub est publiée avec les installeurs certifiés.
