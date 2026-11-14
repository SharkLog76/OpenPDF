# Journal des Modifications (Changelog)

Toutes les modifications notables apportées au projet **OpenPDF** sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et ce projet adhère à la spécification [Semantic Versioning](https://semver.org/lang/fr/).

---

## [0.1.2] - 2026-11-14

### ✨ Nouveautés & Évolutions Majeures
- **Détection Automatique des Mises à Jour (Auto-Update)** :
  - Détection automatique au démarrage de nouvelles versions publiées sur GitHub Releases (`SharkLog76/OpenPDF`).
  - Notification et modale interactive intégrée permettant de consulter les notes de version et de télécharger/installer la mise à jour en un clic.
  - Option manuelle « Vérifier les mises à jour… » dans le menu Aide d'AcrobatMenuBar avec badge dynamique lors de la disponibilité d'une nouvelle version.
- **Refonte Haute Fidélité des Exports Multi-Formats** :
  - **Word (.docx)** : Mode par défaut `exact-layout` garantissant une conformité absolue au PDF (sections aux dimensions exactes en twips, marges nulles, arrière-plan graphique HD plein format et boîtes de texte flottantes `w:framePr` positionnées à leurs coordonnées d'origine avec typographie et couleurs préservées). Mode alternatif `flowing-text` conservé.
  - **PowerPoint (.pptx)** : Mode par défaut `exact-slides` avec diapositive hybride associant le visuel plein format HD (`<p:pic>`) et les boîtes de texte vectorielles éditables (`<p:sp>`) superposées avec typographie préservée et transcription en notes de présentation.
  - **HTML (.html)** : Planches PDF haute fidélité (`.pdf-sheet`) avec dimensions réelles en points, arrière-plan graphique HD, couche de texte en positionnement absolu et feuille de style d'impression `@media print`.
- **Règle Permanente de Gouvernance** :
  - Enregistrement dans les règles projet de l'obligation de publication automatique d'une release GitHub (SemVer, tag, compilation CI/CD) dès que des modifications substantielles sont validées.

### 🔒 Sécurité & Robustesse
- **Caviardage & Biffure Destructifs** : Élimination physique définitive des sous-couches textuelles et rastérisation destructive des pages modifiées pour garantir la confidentialité totale.
- **Protection contre les Injections CSV** : Neutralisation systématique des préfixes de formules (`=`, `@`, `+`, `-`) lors des exports tabulaires tout en préservant les nombres négatifs.
- **Protection Mémoire & Clés Privées** : Remise à zéro explicite (`.fill(0)`) des tampons mémoire de certificats PKCS#12, révocation des Blob URLs et suppression des fuites de mots de passe.
- **CI/CD & Actions GitHub** : Suppression des variables obsolètes de transition Node 20 pour une exécution propre et suppression des avertissements d'annotation sur les releases.

---

## [0.1.1] - 2026-11-14

### ✨ Ajouts (Features)
- **Visualisation & Rendu Local** :
  - Moteur de rendu vectoriel et matriciel haute performance basé sur `pdfjs-dist` avec worker dédié.
  - Mise en cache intelligente LRU (jusqu'à 12 pages) pour un défilement ultra-fluide et instantané.
  - Couche de sélection textuelle native (`text layer`) pour la sélection au curseur et la recherche in-document.
  - Navigation par vignettes latérales, sommaire hiérarchique (*outlines*) et contrôles de zoom (ajuster à la page, taille réelle, zoom libre).
- **Édition Structurelle & Vectorielle** :
  - Ajout de blocs de texte personnalisés (choix de police, taille en points, couleur hexadécimale, alignement, gras, italique).
  - Outil de caviardage / biffure opaque (*whiteout*) avec suppression physique irréversible du contenu masqué dans le binaire PDF final.
  - Annotations graphiques complètes : surlignage translucide, soulignement, barré, formes géométriques (rectangles, ellipses), tracé à main levée et notes.
  - Remplissage et édition des formulaires interactifs standard (`AcroForm`).
  - Ajout de filigranes et d'en-têtes / pieds de page paramétrables.
- **Réorganisation des Pages** :
  - Grille d'organisation visuelle plein écran avec réorganisation des pages par glisser-déposer (*Drag & Drop*).
  - Rotation horaire et anti-horaire page par page ou globale.
  - Extraction de plages de pages vers un nouveau document autonome.
  - Suppression de pages avec sécurité intégrée interdisant la suppression de l'unique page restante.
  - Fusion de plusieurs documents PDF avec contrôle strict du budget d'admission mémoire (512 Mo).
- **Signature Électronique & Cryptographique** :
  - **Signatures visuelles** : Griffe manuscrite sur pavé tactile/souris, import d'image/tampon (PNG, JPEG, WebP, SVG) ou génération calligraphique.
  - **Coffre-fort local persistant (`SignatureVault`)** : Stockage sécurisé et chiffré des signatures réutilisables dans IndexedDB (`openpdf_vault_v1`).
  - **Signature numérique PKCS#7 conforme Adobe Acrobat** : Déverrouillage des conteneurs PKCS#12 (`.pfx` / `.p12`), extraction des certificats X.509, calcul de la table `/ByteRange` et scellement cryptographique SHA-256 / RSA (`adbe.pkcs7.detached`).
  - Panneau d'audit et de vérification d'intégrité des signatures existantes du document.
- **Convertisseur & Export Multi-Formats** :
  - Export Microsoft Word (`.docx`) structuré avec préservation des titres et paragraphes.
  - Export Microsoft PowerPoint (`.pptx`) avec diapositives générées par page.
  - Export Microsoft Excel (`.xlsx`) avec détection des grilles tabulaires.
  - Export Web autonome (`.html`) avec feuille de style CSS.
  - Export en archive haute résolution (`.zip`) contenant l'ensemble des pages en PNG ou JPEG.
- **Espace de Travail Multi-Onglets & Sauvegarde Sécurisée** :
  - Gestion fluide de multiples documents ouverts simultanément dans des onglets indépendants.
  - Détection automatique des modifications non enregistrées (*dirty tracking*) avec invite de sauvegarde anti-perte de données.
  - Historique déterministe d'annulation/rétablissement (*Undo/Redo*) via `CommandLedger` (jusqu'à 200 opérations).
  - Écriture atomique avec fichier de staging temporaire anti-corruption (`<cible>.staging.<pid>.tmp`) et remplacement atomique.
- **Encapsulation Desktop Native (Tauri v2)** :
  - Application native Windows ultra-légère basée sur WebView2 et backend Rust performant.
  - Routage d'instance unique (*single-instance*) avec focus automatique et gestion des arguments de lancement en ligne de commande.
  - Installeur NSIS moderne exécutable par l'utilisateur courant sans nécessiter de privilèges administrateur.
  - Association de fichiers `.pdf` sous Windows.

### 🔒 Sécurité & Souveraineté
- **100 % Local-First** : Aucun appel réseau, aucune télémétrie, aucune dépendance cloud. Vos documents et certificats restent strictement sur votre machine.
- **Budgets d'admission défensifs** : Rejet automatique des fichiers corrompus ou dépassant les limites autorisées (256 Mo pour un PDF, 5 Mo pour une signature, 1 Mo pour un certificat).
- **Protection des secrets** : Les mots de passe et clés privées ne sont jamais persistés ni journalisés.

### ⚖️ Licence
- Publication sous licence libre et open source **GNU General Public License v3.0 (GPL-3.0)**.
