# Calcul en lignes

Calculatrice en lignes, entre le tableur et la calculatrice de téléphone : chaque ligne est un calcul, avec variables (`loyer = 850`), références (`L2 × 12`, `somme(L1:L5)`), sous-totaux (`total`), pourcentages (`80 + 20%`, `15% de 80`) et plusieurs feuilles. Maintenir C efface toute la feuille. Réglages : ambiance, couleur, police, taille, touches, disposition, décimales, TVA. Formules (bouton fx) : conditions, fonctions perso, crédit, et barèmes 2026 (impôt sur le revenu, IFI, successions et donations, usufruit, PFU).

La page est publiée sur le site : https://yvanov40.github.io/public/calcul/ (fichier `index.html`, service hors ligne `sw.js` : augmenter `VERSION` à chaque modification).

L'appli Android (dossier `appli/`, Capacitor) ouvre cette page : une modification de `index.html` arrive d'elle-même sur le téléphone, sans réinstaller. Seule une modification de `appli/` reconstruit l'APK (`.github/workflows/calcul-android.yml`, signé avec la clé de Mes applis si le secret existe, via `appli/preparer-android.js`), publié dans la version « calcul » des Releases :
https://github.com/Yvanov40/public/releases/download/calcul/calcul-en-lignes.apk
