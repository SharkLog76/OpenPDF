<div align="center">

# 📄 OpenPDF

### Le studio PDF local-first, libre et souverain
**L'alternative moderne, performante et sans abonnement à Adobe Acrobat Pro.**

[![Dernière Release](https://img.shields.io/github/v/release/SharkLog76/OpenPDF?label=Derni%C3%A8re%20version&color=0078D6&logo=github)](https://github.com/SharkLog76/OpenPDF/releases/latest)
[![Plateforme](https://img.shields.io/badge/Plateforme-Windows%20x64-0078D6.svg?logo=windows)](https://github.com/SharkLog76/OpenPDF/releases/latest)
[![Licence](https://img.shields.io/badge/Licence-GPL--3.0-brightgreen.svg)](LICENSE)
[![Confidentialité](https://img.shields.io/badge/Souverainet%C3%A9-100%25%20Local--First-success.svg)](#-souverainet%C3%A9--confidentialit%C3%A9-absolue)
[![Tests CI](https://img.shields.io/badge/Tests-47%2F47%20Pass%C3%A9s-brightgreen.svg)](tests/)

<br />

<a href="https://github.com/SharkLog76/OpenPDF/releases/latest">
  <img src="https://img.shields.io/badge/%E2%96%B6%20T%C3%A9l%C3%A9charger%20OpenPDF%20pour%20Windows%20(Gratuit)-0078D6?style=for-the-badge&logo=windows&logoColor=white" height="48" alt="Télécharger OpenPDF" />
</a>

<br /><br />

<!-- Hero Image -->
<p align="center">
  <img src="docs/assets/screenshots/02-editor-document.png" alt="Interface Principale d'OpenPDF" width="95%" style="border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);" />
</p>

*OpenPDF en action : interface inspirée d'Acrobat Pro, lecture multi-onglets, barre d'outils complète et inspecteur de propriétés.*

</div>

---

## 🌟 Visite Guidée de l'Application

### 1. Éditeur de Contenu & Annotations
> Modifiez vos documents avec la même souplesse qu'un traitement de texte, directement sur les calques du PDF.

<p align="center">
  <img src="docs/assets/screenshots/02-editor-document.png" alt="Édition et Formulaires dans OpenPDF" width="90%" style="border-radius: 6px;" />
</p>

- **Édition de texte & formulaire** : Cliquez sur n'importe quel texte ou champ de formulaire interactif (`AcroForm`) pour le modifier en temps réel.
- **Annotations complètes** : Surlignage translucide, souligné, barré, formes géométriques (rectangles, ellipses), tracé libre et notes repositionnables.
- **Caviardage & Biffure opaque** : Masquage garanti et suppression physique définitive du texte sensible dans le fichier sauvegardé.

---

### 2. Réorganisation & Manipulation des Pages
> Glissez, déposez, pivotez et assemblez vos documents en toute simplicité.

<p align="center">
  <img src="docs/assets/screenshots/03-page-organizer.png" alt="Organisation visuelle des pages" width="90%" style="border-radius: 6px;" />
</p>

- **Mosaïque visuelle interactive** : Vue d'ensemble de l'ensemble des pages avec miniatures générées en temps réel.
- **Glisser-Déposer (*Drag & Drop*)** : Réorganisez l'ordre des pages instantanément.
- **Actions en un clic** : Rotation horaire/anti-horaire par page, suppression sécurisée, insertion de pages vierges et extraction vers un nouveau document.

---

### 3. Signature Électronique PKCS#7 & Coffre-Fort Local
> Signez vos contrats et documents officiels avec un scellement cryptographique conforme aux normes Adobe Acrobat.

<p align="center">
  <img src="docs/assets/screenshots/04-signature-vault.png" alt="Coffre-fort de signatures et signature PKCS#7" width="90%" style="border-radius: 6px;" />
</p>

- **Signature visuelle & Tampons** : Tracez votre signature manuscrite à la souris/pavé tactile, importez un fichier image (`.png`, `.svg`) avec détourage automatique du fond blanc, ou générez un tampon typographique.
- **Signature numérique légale (`.pfx` / `.p12`)** : Déverrouillage sécurisé de votre certificat X.509, hachage SHA-256, calcul de la table `/ByteRange` et scellement PKCS#7 détaché (`adbe.pkcs7.detached`).
- **Coffre-fort local chiffré (`SignatureVault`)** : Vos griffes et tampons restent enregistrés localement dans IndexedDB pour vos prochaines signatures, sans jamais persister vos mots de passe.

---

### 4. Conversion & Export Multi-Formats
> Exportez vos documents PDF vers les formats bureautiques courants en un clic, 100 % hors-ligne.

<p align="center">
  <img src="docs/assets/screenshots/05-export-formats.png" alt="Dialogue d'exportation multi-formats" width="90%" style="border-radius: 6px;" />
</p>

- **Microsoft Word (`.docx`)** : Conversion structurée avec détection des titres, paragraphes et tableaux.
- **Microsoft PowerPoint (`.pptx`)** : Génération de diapositives par page avec blocs de texte positionnés.
- **Microsoft Excel (`.xlsx`) & CSV** : Détection des grilles tabulaires et extraction de données.
- **Web & Images** : Export en page Web autonome (`.html`) ou en archive ZIP (`.png` / `.jpeg`) haute fidélité.

---

### 5. Accueil & Espace de Travail Multi-Onglets
> Travaillez sur plusieurs dossiers simultanément sans ralentissement.

<p align="center">
  <img src="docs/assets/screenshots/01-welcome-hub.png" alt="Accueil et Hub de démarrage" width="90%" style="border-radius: 6px;" />
</p>

- **Hub de démarrage rapide** : Ouvrez un PDF local, créez un document vierge ou chargez le PDF de démonstration interactif.
- **Navigation par onglets** : Ouvrez plusieurs PDF en parallèle avec gestion indépendante de l'historique (*Undo/Redo* jusqu'à 200 étapes) et du zoom.
- **Protection anti-perte de données** : Alerte de confirmation lors de la fermeture si des modifications n'ont pas été enregistrées.

---

## 🥊 Pourquoi Choisir OpenPDF ?

| Critère | OpenPDF | Adobe Acrobat Pro | Outils en Ligne (Smallpdf, iLovePDF...) |
| :--- | :---: | :---: | :---: |
| **Tarif** | **100 % Gratuit & Open Source** | ~287 € / an (Abonnement obligatoire) | Freemium / Payant |
| **Confidentialité & Données** | **100 % Local** (Zéro Cloud) | Téléversement Cloud Adobe | Téléversement sur serveurs tiers |
| **Usage Hors-Ligne** | **Totalement autonome** | Connexion requise périodiquement | Impossible sans Internet |
| **Signature Cryptographique** | **Inclus (PKCS#7 / PFX)** | Inclus | Souvent payant ou non-conforme |
| **Poids & Performance** | **Léger (< 15 Mo)** | Lourd (> 1,5 Go) | Dépend du navigateur |
| **Licence** | **GNU GPL-3.0** | Propriétaire fermée | Propriétaire fermée |

---

## 🔒 Souveraineté & Confidentialité Absolue

- **Aucun envoi réseau** : Vos contrats, factures et documents sensibles ne quittent jamais votre machine.
- **Sauvegarde atomique sécurisée** : Les documents ne sont jamais modifiés en direct. Toute sauvegarde passe par un fichier temporaire de staging (`.staging.tmp`) pour éviter toute corruption en cas de coupure inattendue.
- **Budgets d'admission stricts** : Protection contre les fichiers malformés ou piégés (rejet automatique si non-conforme aux standards ISO 32000-1).

---

## 📥 Télécharger et Installer

1. Téléchargez la dernière version : **[OpenPDF pour Windows (x64)](https://github.com/SharkLog76/OpenPDF/releases/latest)**.
2. Lancez l'installeur `OpenPDF_x.x.x_x64-setup.exe` (ne nécessite aucun droit administrateur).
3. Profitez immédiatement d'un studio PDF complet, fluide et gratuit.

Pour consulter le journal détaillé de toutes les versions : **[Changelog officiel (CHANGELOG.md)](CHANGELOG.md)**.

---

## 📖 Référentiel Technique & Architecture

Pour les développeurs et contributeurs souhaitant explorer ou étendre le code :
- [Index Technique & Navigation Zéro-Token](docs/architecture/index.md)
- [Vue Globale de l'Architecture](docs/architecture/overview.md)
- [Processus Métier de Bout en Bout](docs/architecture/processes-and-workflows.md)
- [Contrats, Modèles & Catalogue d'Erreurs](docs/architecture/contracts-and-domain.md)

---

## ⚖️ Licence

Ce projet est distribué sous licence libre **GNU General Public License v3.0** (GPL-3.0). Consultez le fichier [LICENSE](LICENSE) pour plus de détails.
