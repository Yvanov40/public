# Calcul en lignes

Calculatrice en lignes, entre le tableur et la calculatrice de téléphone : chaque ligne est un calcul, avec variables (`loyer = 850`), références (`L2 × 12`, `somme(L1:L5)`), sous-totaux (`total`), pourcentages (`80 + 20%`, `15% de 80`) et plusieurs feuilles. Maintenir C efface toute la feuille.

L'appli tient dans `www/index.html`. À chaque modification de ce dossier, GitHub Actions (`.github/workflows/calcul-android.yml`) construit l'APK et le publie dans la version « calcul » des Releases :
https://github.com/Yvanov40/public/releases/download/calcul/calcul-en-lignes.apk
