# Révision — QCM

Des QCM pour réviser la base documentaire, **un par fiche** : Yvan envoie une fiche à Claude en demandant un QCM,
Claude écrit les questions (autant qu'il en faut pour couvrir la fiche) et ajoute une tuile, datée, qui reste dans l'appli.

- `data/qcm/index.json` : la liste des QCM (une tuile chacun) :
  `{ "qcm": [ { "id": "2026-11-19-presents-usage", "titre": "Présent d'usage", "fichier": "Présent d'usage.docx", "date": "2026-11-19", "nb": 18, "theme": "Transmission" } ] }`
- `data/qcm/<id>.json` : le QCM lui-même :
  `{ "id", "titre", "fichier", "date", "questions": [ { "question", "choix": ["…", "…", "…", "…"], "reponse": 0, "explication", "theme" } ] }`
  (`reponse` : numéro du bon choix, à partir de 0 ; l'appli mélange l'ordre des choix à l'affichage).
- Ajouter un QCM : écrire `data/qcm/<id>.json`, l'ajouter en tête de `index.json`, augmenter `VERSION` dans `sw.js`.
- Les résultats (essais, erreurs à refaire) restent sur l'appareil (`localStorage` « revision-qcm »).
- Ce dépôt est public : les questions le sont aussi (pas de données de clients dedans).

Adresse : https://yvanov40.github.io/public/revision/
