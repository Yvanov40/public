package fr.yvanov.applis;

import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

// L'application : les applis en ligne (GitHub Pages) dans une fenêtre Android.
// En plus de Capacitor : l'impression (window.print) et les exports, via le petit script « natif.js ».
public class MainActivity extends BridgeActivity {
    private String script = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try (InputStream in = getAssets().open("public/natif.js")) {
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) { script = ""; }
        WebView vue = getBridge().getWebView();
        vue.getSettings().setTextZoom(100);   // la taille du texte reste celle des applis
        vue.addJavascriptInterface(new Impression(), "AppliAndroid");
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                if (!script.isEmpty()) webView.evaluateJavascript(script, null);
            }
        });
    }

    private class Impression {
        @JavascriptInterface
        public void imprimer(final String titre) {
            runOnUiThread(() -> {
                WebView vue = getBridge().getWebView();
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                String nom = (titre == null || titre.isEmpty()) ? "Document" : titre;
                PrintDocumentAdapter adaptateur = vue.createPrintDocumentAdapter(nom);
                pm.print(nom, adaptateur, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }
    }
}
