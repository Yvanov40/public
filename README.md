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

## Identifiant et mot de passe

Le site est public mais ne contient aucune donnée : le fichier de suivi est dans le dépôt privé `suivi`, lisible
seulement avec une clé d'accès GitHub. Le compte permet de retrouver cette clé avec un identifiant et un mot de passe,
depuis n'importe quel appareil :

- `suivi/comptes/<empreinte>.json` : les réglages GitHub (dont la clé) chiffrés par le mot de passe
  (AES-GCM 256 bits, PBKDF2-SHA-256 600 000 tours). Le nom du fichier est une empreinte de l'identifiant.
- Le Suivi demande toujours la connexion ; les simulateurs, dès qu'un compte a servi sur l'appareil.
- Après un temps sans utilisation, les données gardées par le navigateur sont chiffrées avec la même clé.
- `verrou.source.js` : le module commun, recopié au début de chaque appli (repères `verrou : début` / `verrou : fin`).

## Fichiers à la racine

- `index.html` : la page d’accueil « Mes applis ».
- `sw.js` : ancien service hors connexion commun ; il ne fait plus que se désinstaller des appareils qui l’avaient.
- `gp.html` : ancienne adresse de l’Audit, renvoie vers `audit/`.

Ces deux derniers pourront être supprimés quand tous les appareils seront passés par les nouvelles adresses.

## Mises à jour

Chaque appli vérifie au lancement s’il existe une nouvelle version et la prend d’elle-même
(Suivi, Audit, Succession, Plus-value : le réseau d’abord, la copie gardée seulement hors connexion).
Les données du Suivi ne sont jamais dans ce dépôt public.
