# Gestion Multi-Onglets, Multi-Fenêtres, Fermeture & Application PDF par Défaut (`shell/multi-tab-and-close-lifecycle`)

## Outcome and scope

Faire évoluer l'application sous le nom **OpenPDF** avec une gestion complète d'onglets PDF dans une instance unique par défaut, la possibilité explicite d'ouvrir un PDF externe dans l'instance courante (nouvel onglet) ou dans une nouvelle fenêtre/instance, le réordonnancement et le détachement d'un onglet par glisser hors fenêtre, des invites fiables d'enregistrement / avertissement multi-onglets à la fermeture, le renommage de « Preuves REA » en **« Empreinte du Fichier »**, et l'inscription Windows comme lecteur PDF par défaut.

## Functional contract

1. **Identité & Terminologie OpenPDF** :
   - Toute l'interface (barre de menus, titre de fenêtre, page d'accueil, dialogues, package/binaire `openpdf`) porte le nom **OpenPDF**.
   - L'onglet et les entrées de vérification d'intégrité/signatures affichent **« Empreinte du Fichier »** (au lieu de « Preuves REA »), tout en conservant le détail structuré SHA-256 et vérifications `/ByteRange`.
2. **Gestion multi-onglets isolés (`WorkspaceTab`)** :
   - Chaque onglet détient sa propre session (`DocumentSessionService`, `OpenedSessionBundle`, `EditorDocumentState`, `FileOriginHandle`, historique undo/redo, état zoom/page/rotation, placements de signature).
   - La barre d'onglets permet d'ouvrir un nouvel onglet (`+`), basculer d'un onglet à l'autre sans perdre les éditions ni recharger PDF.js, réordonner les onglets par glisser-déposer horizontal, et fermer un onglet (`×`).
   - Le détachement d'un onglet hors des limites de la fenêtre (ou via bouton « Détacher ») transfère l'état complet du document (octets source, chemin disque, commandes ledger, signatures, viewport) vers une nouvelle fenêtre indépendante via `DetachedTabStore` sans perte de modifications.
3. **Instance unique & routage d'ouverture externe** :
   - Via `tauri-plugin-single-instance`, l'ouverture d'un second fichier `.pdf` depuis l'Explorateur Windows ne crée pas silencieusement une fenêtre concurrente : la fenêtre active revient au premier plan et propose dans `ExternalOpenChoiceModal` :
     - **Ouvrir dans l'instance actuelle (nouvel onglet)** ;
     - **Ouvrir dans une nouvelle instance / fenêtre** ;
     - option facultative *« Mémoriser mon choix »* modifiable dans les menus.
4. **Sûreté à la fermeture (onglet & fenêtre)** :
   - Fermeture d'un onglet modifié (`isDirty === true`) : invite à **Enregistrer**, **Ne pas enregistrer** ou **Annuler**.
   - Fermeture de la fenêtre/application (`onCloseRequested` / `beforeunload`) : si au moins un onglet est modifié **ou** si plus d'un onglet document est ouvert (`tabs.length > 1`), affichage d'une boîte modale d'avertissement explicitant les onglets ouverts et proposant d'accepter l'enregistrement des documents modifiés, de refuser et fermer quand même, ou d'annuler.
5. **Lecteur PDF par défaut sous Windows** :
   - Commande Rust `check_pdf_default_status` (lecture `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice`).
   - Enregistrement utilisateur courant sans élévation (`HKCU\Software\Classes\OpenPDF.Document`, `RegisteredApplications`) et ouverture guidée des Paramètres Windows (`ms-settings:defaultapps`) pour finaliser le choix système exigé par Windows 10/11.

## Non-goals

- Écriture forcée ou falsification du hash système protégé `UserChoice` de Windows.

## Resource admission

- Plafond maximal de 12 onglets document ouverts simultanément par fenêtre (`MAX_OPEN_TABS_PER_WINDOW`) pour borner l'empreinte mémoire des contextes PDF.js.
- Libération explicite de `DocumentSessionService.dispose()` lors de la fermeture de chaque onglet ou fenêtre.

## Verification

- Tests unitaires purs sur la logique d'onglets, réordonnancement, garde de fermeture et choix d'ouverture (`tests/workspace-tabs.test.ts`).
- Tests unitaires Rust (`DetachedTabStore`, `PendingWindowPathStore`, détection `.pdf`).
- Tests TypeScript (`npm.cmd run typecheck` et `npm.cmd test`).
