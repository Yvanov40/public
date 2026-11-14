# Mes applis

Site publié par GitHub Pages : <https://yvanov40.github.io/public/>

La page d’accueil (`index.html`) mène à chaque appli ; chacune s’ouvre dans sa propre fenêtre et
s’installe séparément sur le téléphone ou l’ordinateur (son manifeste, son icône, son service hors connexion).

| Dossier        | Appli                                                         | Données                                                        |
|----------------|---------------------------------------------------------------|----------------------------------------------------------------|
| `suivi/`       | Suivi des dossiers : dossiers, clients, agenda, Dutreil, activité, émoluments | `suivi_gp.json` dans le dépôt **privé** `Yvanov40/suivi` |
| `audit/`       | Audit civil et fiscal (transmission)                          | sur l’appareil ; recopié dans le Suivi (section `audits`)      |
| `succession/`  | Simulateur de succession (options du conjoint survivant)      | aucune (calcul seul)                                           |
| `pvi/`         | Simulateur de plus-value immobilière                          | aucune (calcul seul)                                           |
| `revision/`    | Révision de la base : QCM, vrai ou faux, fiches               | `revision/data/` (état partagé et sessions préparées)          |

## Fichiers à la racine

- `index.html` : la page d’accueil « Mes applis ».
- `sw.js` : ancien service hors connexion commun ; il ne fait plus que se désinstaller des appareils qui l’avaient.
- `gp.html` : ancienne adresse de l’Audit, renvoie vers `audit/`.

Ces deux derniers pourront être supprimés quand tous les appareils seront passés par les nouvelles adresses.

## Mises à jour

Chaque appli vérifie au lancement s’il existe une nouvelle version et la prend d’elle-même
(Suivi, Audit, Succession, Plus-value : le réseau d’abord, la copie gardée seulement hors connexion).
Les données du Suivi ne sont jamais dans ce dépôt public.
