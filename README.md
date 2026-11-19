# Mes applis

Site publié par GitHub Pages : <https://yvanov40.github.io/public/>

La page d’accueil (`index.html`) mène à chaque appli ; chacune s’ouvre dans sa propre fenêtre et
s’installe séparément sur le téléphone ou l’ordinateur (son manifeste, son icône, son service hors connexion).

| Dossier        | Appli                                                         | Données                                                        |
|----------------|---------------------------------------------------------------|----------------------------------------------------------------|
| `suivi/`       | Suivi des dossiers : dossiers, clients, agenda, Dutreil, activité, émoluments | `suivi_gp.json` dans le dépôt **privé** `Yvanov40/suivi` |
| `audit/`       | Audit civil et fiscal (transmission)                          | sur l’appareil ; recopié dans le Suivi (section `audits`)      |
| `succession/`  | Simulateur de succession (options du conjoint survivant)      | sur l’appareil ; recopié dans le Suivi (section `simulations`) |
| `pvi/`         | Simulateur de plus-value immobilière                          | sur l’appareil ; recopié dans le Suivi (section `simulations`) |
| `immo/`        | Investissement immobilier : nu, LMNP, SCI à l’IR ou à l’IS comparés | sur l’appareil ; recopié dans le Suivi (section `simulations`) |
| `revision/`    | Révision de la base : QCM, vrai ou faux, fiches               | `revision/data/` (état partagé et sessions préparées)          |

## Simulations rattachées aux clients

L’Audit, la Succession, la Plus-value et l’Investissement immobilier restent des applis autonomes. Chacune garde plusieurs simulations,
et chaque simulation peut être rattachée à un client du Suivi (depuis l’appli, bouton « Simulations »,
ou depuis la fiche du client dans le Suivi). Le Suivi les enregistre dans `suivi_gp.json`, donc sur GitHub
et sur vos autres appareils, et les montre dans la fiche du client et dans son onglet « Simulations ».

- `lien-suivi.source.js` : le module commun de la Succession, de la Plus-value et de l’Investissement immobilier (recopié dans leur page,
  entre les repères `lien-suivi : début` et `lien-suivi : fin`). Il n’est pas chargé par le site lui-même.

## Apparence commune

Les applis (Audit, Succession, Plus-value, Investissement, Révision) reprennent par défaut l'apparence du Suivi
(couleurs, fond, polices, thème, taille, coins, relief). Le bouton « Apparence » de chacune ouvre le même panneau,
qui permet aussi une apparence propre aux applis, commune à toutes.

- `habillage.source.js` : le module commun, recopié au début de chaque appli (repères `habillage : début` / `habillage : fin`),
  avec les correspondances entre les couleurs communes et les variables CSS de l'appli.

## Personnaliser et exports (les quatre simulateurs)

Audit, Succession, Plus-value et Investissement ont le même bouton « Personnaliser », à deux onglets :
*Apparence* (module habillage) et *Mise en page* : côte à côte, inversée, une colonne, résultats d'abord,
pas à pas ; largeur de la colonne de saisie (gardée par appli), largeur de la page, navigation (barre, menu
latéral, masquée), densité ; nom du cabinet et logo des exports. Puis trois boutons : PowerPoint, PDF, Excel.

- `dialogue.source.js` : les fenêtres de confirmation, d'information et de saisie (à la place de confirm, alert et prompt),
  recopiées dans le `<head>` de chaque appli (repères `dialogue : début` / `dialogue : fin`).
- `disposition.source.js` : le module commun, recopié à la fin de chaque simulateur (repères `disposition : début` /
  `disposition : fin`) ; chaque appli décrit sa mise en page et ses exports dans `window.DISPOSITION`.
- Excel en formules vivantes : `immo/excel.js` et `pvi/excel.js` (hypothèses en haut de chaque onglet, en jaune ;
  formules du même onglet ; aucun nom défini). `xlcalc.js` calcule les valeurs avant l'enregistrement, pour les aperçus.
- Les bibliothèques d'export sont dans le dossier `vendor/` de chaque appli (exports possibles hors connexion).

## Fichiers à la racine

- `index.html` : la page d’accueil « Mes applis ».
- `sw.js` : ancien service hors connexion commun ; il ne fait plus que se désinstaller des appareils qui l’avaient.
- `gp.html` : ancienne adresse de l’Audit, renvoie vers `audit/`.

Ces deux derniers pourront être supprimés quand tous les appareils seront passés par les nouvelles adresses.

## Mises à jour

Chaque appli vérifie au lancement s’il existe une nouvelle version et la prend d’elle-même
(Suivi, Audit, Succession, Plus-value : le réseau d’abord, la copie gardée seulement hors connexion).
Les données du Suivi ne sont jamais dans ce dépôt public.

## Application Android (Capacitor)

Le dossier `application/` contient une application Android, « Mes applis », qui ouvre ces pages
(https://yvanov40.github.io/public/) dans une fenêtre Android. Les applis se mettent à jour d'elles-mêmes ;
l'application elle-même ne change que rarement.

- En plus des pages : les exports (Excel, PowerPoint, PDF, sauvegardes) passent par le menu Android
  « Partager / Enregistrer », et « Imprimer » ouvre l'impression d'Android (qui propose « Enregistrer au format PDF ») —
  voir `application/www/natif.js` et `MainActivity.java`.
- Construction : à chaque modification du dossier, GitHub Actions (`.github/workflows/application-android.yml`)
  construit l'APK et la publie : https://github.com/Yvanov40/public/releases/download/application/mes-applis.apk
- Signature : secrets du dépôt `APPLI_KEYSTORE_B64` (la clé, en base64) et `APPLI_KEYSTORE_MDP` (son mot de passe).
  Sans eux, l'APK est signée avec une clé de test qui change à chaque construction.
- Icônes : `application/assets/` puis `npx capacitor-assets generate --android`.

### Version iPhone (sur le Mac)

Le même projet contient la version iPhone (`application/ios`). Elle se construit avec Xcode, sur le Mac :

1. Xcode (App Store du Mac) et Node.js (nodejs.org) installés.
2. Dans le Terminal : `git clone https://github.com/Yvanov40/public.git`, puis `cd public/application`, `npm ci`, `npx cap sync ios`, `npx cap open ios`.
3. Dans Xcode : cible « App » › Signing & Capabilities › Team : votre identifiant Apple (Add Account…).
4. iPhone branché (et « Mode développeur » activé dans Réglages › Confidentialité et sécurité), choisir l'iPhone en haut, puis ▶.
5. Avec un identifiant Apple gratuit, l'application est à réinstaller (▶) tous les 7 jours ; avec le programme développeur, elle tient un an.

## Application pour ordinateur (Windows et Mac)

Le dossier `bureau/` contient « Mes applis » pour ordinateur (Electron) : une seule fenêtre, ouverte en grand ; l'appli choisie
occupe tout l'espace et la liste des applis glisse depuis la gauche (petite flèche en haut à gauche, ou souris contre le bord gauche ;
📌 pour la garder ouverte ; Ctrl + 1 … 6). Chaque appli ouverte reste chargée. Exports par « Enregistrer sous », impression du système,
liens extérieurs dans le navigateur (`main.js`, `cadre.html`, `preload.js`).
GitHub Actions (`.github/workflows/bureau.yml`) la construit à chaque modification du dossier :
- Windows : https://github.com/Yvanov40/public/releases/download/bureau/Mes-applis-Windows.exe
- Mac : https://github.com/Yvanov40/public/releases/download/bureau/Mes-applis-Mac.dmg

Elle n'est pas signée : Windows (« Windows a protégé votre ordinateur » › Informations complémentaires › Exécuter quand même)
et le Mac (clic droit › Ouvrir) demandent une confirmation au premier lancement.
