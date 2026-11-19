# Consignes pour travailler sur ce dépôt

Ce dépôt contient les applis web de Yvan, publiées sur GitHub Pages (https://yvanov40.github.io/public/) :
Suivi (`suivi/`, l'appli de référence), Audit (`audit/`), Succession (`succession/`), Plus-value (`pvi/`),
Investissement (`immo/`), Révision (`revision/`), et la page d'accueil (`index.html`).
Les applications Android et iPhone (`application/`, Capacitor) et pour ordinateur (`bureau/`, Electron)
chargent ces pages depuis le site. Voir aussi le README.

## Avant de toucher à quoi que ce soit

- **Récupérer la dernière version** : `git pull` au début du travail, et de nouveau avant chaque envoi.
  Une seule session à la fois modifie les applis ; si l'envoi est refusé, fusionner, ne jamais forcer (`--force` interdit).
- Les données de Suivi (dossiers, clients, notes) ne sont pas ici : elles sont dans le dépôt privé `Yvanov40/suivi`
  (sauvegardes quotidiennes dans `sauvegardes/`). Ne jamais écrire de données de clients dans ce dépôt public.
- Ne jamais écrire de jeton GitHub, de mot de passe ni de clé dans un fichier ou un message de commit.

## À chaque modification d'une appli

- **Augmenter le numéro de version** dans le `sw.js` de l'appli (`const VERSION = "suivi-v27"` → `"suivi-v28"`) :
  c'est ce qui déclenche la mise à jour sur les appareils. Deux versions différentes ne doivent jamais porter le même numéro.
- Chaque appli tient dans un seul `index.html` (plus quelques fichiers à côté : `excel.js`, `vendor/`…).
  Les modules communs `habillage.source.js` (Personnaliser : apparence) et `disposition.source.js`
  (mise en page, exports PowerPoint / PDF / Excel) sont recopiés dans chaque appli : une correction se reporte dans toutes.
- Tester avant d'envoyer (navigateur sans interface, ordinateur et téléphone) : aucune erreur, et le parcours modifié fonctionne.
- Garder les données existantes : une nouvelle structure reprend l'ancienne (migration) sans rien perdre,
  y compris quand un autre appareil a encore l'ancienne version et synchronise entre-temps.
- Commits au nom de `Yvanov40` (`git -c user.name=Yvanov40 -c user.email=Yvanov40@users.noreply.github.com commit …`).

## Préférences de Yvan

- **Répondre en français**, simplement, sans jargon technique inutile ; commencer par citer ses sources.
- Couleurs par défaut : **or (165, 125, 47)** et **bleu (12, 45, 57)**. Toujours une possibilité de personnaliser
  couleurs, police et mise en page (plusieurs dispositions au choix), et des champs de saisie soignés plutôt que les contrôles du système.
- Excel : police **Grandview, taille 8**, sans quadrillage ; formules vivantes, hypothèses en haut de chaque feuille.
- Suivi est la référence visuelle pour les autres applis.

## Applications installées (téléphone, ordinateur)

- Modifier une appli (`suivi/`, `audit/`…) : rien à réinstaller, la modification arrive d'elle-même.
- Modifier `application/` (Android / iPhone) ou `bureau/` (Windows / Mac) touche à « l'emballage » :
  **prévenir Yvan qu'il faudra réinstaller**. GitHub Actions reconstruit alors l'installateur
  (`.github/workflows/application-android.yml`, `.github/workflows/bureau.yml`) et le publie dans les Releases
  (`application` : APK ; `bureau` : Windows et Mac). La version iPhone se construit avec Xcode sur le Mac de Yvan.
- Pour un envoi qui ne doit pas reconstruire l'APK Android (sa signature change à chaque construction) : `[skip ci]` dans le message.
