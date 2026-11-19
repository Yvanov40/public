// Prépare android/app/build.gradle après « npx cap add android » (lancé par GitHub Actions) :
// numéro de version, et signature avec la clé de « Mes applis » si elle est fournie,
// pour que chaque nouvelle version s'installe par-dessus l'ancienne sans perdre les feuilles.
const fs = require("fs");
const f = "android/app/build.gradle";
let g = fs.readFileSync(f, "utf8");
const n = process.env.NUMERO || "1";
g = g.replace(/versionCode 1\b/, "versionCode " + n).replace(/versionName "1.0"/, 'versionName "1.0.' + n + '"');
const signature = `    def cle = System.getenv("APPLI_KEYSTORE_FICHIER")
    signingConfigs {
        if (cle) {
            appli {
                storeFile file(cle)
                storePassword System.getenv("APPLI_KEYSTORE_MDP")
                keyAlias System.getenv("APPLI_KEYSTORE_ALIAS") ?: "mesapplis"
                keyPassword System.getenv("APPLI_KEYSTORE_MDP")
            }
        }
    }
    buildTypes {
        release {
            signingConfig cle ? signingConfigs.appli : signingConfigs.debug`;
const avant = g;
g = g.replace(/    buildTypes \{\n        release \{/, signature);
if (g === avant) { console.error("build.gradle : bloc buildTypes introuvable"); process.exit(1); }
fs.writeFileSync(f, g);
console.log("build.gradle prêt, version 1.0." + n + (process.env.APPLI_KEYSTORE_FICHIER ? ", signé avec la clé de Mes applis" : ", clé de test"));
