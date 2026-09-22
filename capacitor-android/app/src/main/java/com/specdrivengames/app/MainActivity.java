package com.specdrivengames.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * The app's only activity.
 *
 * Everything here is the hardware back button, and it is native rather than
 * JavaScript for one reason: <b>the bridge is not where the content is.</b>
 *
 * <p>Capacitor injects its bridge into the origin the app boots from — the
 * bundled shell in {@code capacitor/www}. That shell's entire job is to
 * navigate to {@code https://specdrivengames.com}, and once it has, every
 * page the player actually touches is an ordinary remote origin with no
 * bridge, no plugins, and therefore no {@code @capacitor/app} back-button
 * listener. The documented JavaScript approach would work on exactly one
 * screen, the one nobody sees.
 *
 * <p>Left unhandled, back closes the app instantly from any screen — which is
 * both a bad app and a documented Play rejection under the
 * minimum-functionality policy. The WebView already keeps the history that
 * answers it; this hands the button to that history.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /*
         * Registered after super.onCreate() on purpose.
         *
         * OnBackPressedDispatcher runs its callbacks in reverse order of
         * registration, so the last one added wins. BridgeActivity registers
         * its own inside super.onCreate() — the one that routes back through
         * the JS bridge — and ours has to sit in front of it, because on the
         * remote origin that bridge has nothing listening and the fallback is
         * to close the app.
         */
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;

                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                /*
                 * Nothing left to go back to, so back means leave — and leave
                 * has to mean this callback stepping aside rather than
                 * calling finish() directly. Disabling it and re-dispatching
                 * lets the platform do whatever it does on this Android
                 * version, which on 13+ includes the predictive back gesture
                 * animating the app away rather than blinking it off screen.
                 */
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }
}
