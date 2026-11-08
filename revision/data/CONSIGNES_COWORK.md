# Consignes pour la tâche Cowork « Préparer la session de révision »

Tu prépares la prochaine session de révision de l'application https://yvanov40.github.io/public/revision/.
Dépôt GitHub : `Yvanov40/public`, branche `main`, dossier `revision/data/`.

## 1. Vérifier s'il faut agir

1. S'il est entre 20 h et 8 h (heure de Paris), ne fais rien et arrête-toi.
2. Lis `revision/data/session-claude.json` (champ `id`) et `revision/data/resultats.json`.
3. Si `resultats.json` ne contient **aucune** entrée `{"src": "claude", "session": <id actuel>, "fin": true}`, la session en cours n'est pas terminée : ne fais rien et arrête-toi.

## 2. Analyser les résultats

Dans `resultats.json` (tableau `reponses`) :
- entrées `src: "claude"` : réponses aux sessions préparées (`fiche`, `question`, `choisi`, `ok`) ;
- entrées `src: "auto"` : cartes générées par l'application (`fiche`, `section`, `attendu`, `note` 0 = raté, 1 = partiel, 2 = réussi).

Repère : les fiches et notions ratées récemment, les fiches jamais travaillées, les fiches réussies depuis longtemps (à réviser).

## 3. Choisir le contenu

- Les fiches sont dans le dossier OneDrive **BASE** (connecteur Microsoft 365). Lis la ou les fiches choisies **en entier** avant d'écrire.
- Composition : environ 4 questions sur les erreurs récentes (reformulées autrement, pas à l'identique), 6 sur une fiche pas encore travaillée ou peu réussie, 2 de rappel sur une fiche réussie il y a plus d'une semaine.
- Alterne les thèmes d'une session à l'autre (transmission, succession, assurance-vie, IR, IFI, plus-values, sociétés, immobilier, reports d'imposition).

## 4. Rédiger les questions

- 12 questions à choix multiples, 4 choix (ou 2 pour un vrai/faux), une seule bonne réponse, position de la bonne réponse variée.
- Formulées **avec tes propres mots**. Ne recopie jamais de passage des fiches (contenu Fidroit, dépôt public) : une explication fait au plus 2 phrases.
- Privilégie le raisonnement de conseiller : cas pratiques chiffrés courts, conditions, délais, pièges, articles du CGI ou du Code civil.
- Chaque chiffre doit être vérifié dans la fiche (date de mise à jour comprise). En cas de doute, ne pose pas la question.
- Distracteurs plausibles (autres seuils ou taux réels du même domaine), jamais absurdes.

## 5. Écrire le fichier

Remplace `revision/data/session-claude.json` par un JSON UTF-8 valide de cette forme :

```json
{
  "id": "AAAA-MM-JJ-HHhMM-sujet-court",
  "creee_le": "date ISO 8601",
  "titre": "Titre court de la session",
  "pourquoi": "Une phrase : ce que cible la session et pourquoi (ex. : 3 erreurs sur le Dutreil hier).",
  "questions": [
    {
      "fiche": "Titre exact de la fiche BASE",
      "theme": "Transmission",
      "question": "…",
      "choix": ["…", "…", "…", "…"],
      "reponse": 0,
      "explication": "…"
    }
  ]
}
```

`reponse` est l'index (à partir de 0) du bon choix dans `choix`. L'`id` doit être nouveau à chaque session.
Message de commit : `Session Claude : <titre>`. Ne modifie aucun autre fichier du dépôt.

## 6. Compte rendu

Termine par 2 lignes : la session créée (titre, fiches utilisées) et ce qui a motivé ce choix.
