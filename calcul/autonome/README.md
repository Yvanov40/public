# Calcul autonome (Android)

Variante de Calcul qui contient la page dans l'APK : elle ne charge rien depuis le site et marche hors ligne dès la première ouverture. Elle ne se met pas à jour toute seule : il faut installer un nouvel APK.

Identifiant `fr.yvanov.calculautonome` : elle cohabite avec l'appli « Calcul en lignes » (qui, elle, ouvre la page du site et se met à jour seule). Les feuilles de l'une et de l'autre sont séparées ; on les passe de l'une à l'autre avec Réglages → Mes feuilles et réglages → Copier, puis Importer.

Construction : `.github/workflows/calcul-autonome.yml`, à la main (Actions → Calcul autonome → Run workflow) ou à chaque modification de ce dossier. Au moment de la construction, `www/` reçoit la version en cours de `calcul/index.html`, `calcul/vendor/` et les icônes. L'APK est publié dans la version « calcul-autonome » des Releases.

## Mise à jour depuis l'appli

À chaque ouverture (avec du réseau), l'appli compare sa version (`sw.js`) à celle du site
et propose « Installer » : les fichiers listés dans `LOCAL` de `sw.js` sont téléchargés dans l'appli
et utilisés à la place (Capacitor `WebView.setServerBasePath`). Feuilles et réglages sont gardés.
Bouton aussi dans Réglages › Mise à jour. Une nouvelle APK installée repart de sa propre page.
