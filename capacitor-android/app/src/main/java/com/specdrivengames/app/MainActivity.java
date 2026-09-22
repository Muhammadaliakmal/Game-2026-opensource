package com.specdrivengames.app;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;

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

        if (getBridge() != null) {
            getBridge().setWebViewClient(new NoAdsWebViewClient(getBridge()));
        }
    }

    /**
     * Refuses every request to Google's ad hosts.
     *
     * <p>{@code AdSlot} already renders nothing in the app, but the site's
     * root layout loads {@code adsbygoogle.js} on every page, and with Auto
     * ads switched on in the AdSense console that script places ads by itself.
     * AdSense inside a bare WebView is the "Valuable Inventory: Framed Sites"
     * violation, so the guarantee has to hold whatever the console says. It
     * lives here rather than in the page because a guard script races the
     * async ad script; this does not.
     *
     * <p>Subclasses {@link BridgeWebViewClient} and defers to it for
     * everything else: its {@code shouldInterceptRequest} is what serves the
     * bundled shell, and replacing it outright would break the launch.
     */
    private static final class NoAdsWebViewClient extends BridgeWebViewClient {
        private static final String[] AD_HOST_SUFFIXES = {
            "googlesyndication.com",
            "doubleclick.net",
            "adservice.google.com",
            "adtrafficquality.google",
        };

        NoAdsWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String host = request.getUrl().getHost();
            if (host != null) {
                for (String suffix : AD_HOST_SUFFIXES) {
                    if (host.equals(suffix) || host.endsWith("." + suffix)) {
                        // An empty 200 rather than an error: a failed
                        // subresource is noise in the console and nothing
                        // else, but an empty script is simply nothing.
                        return new WebResourceResponse(
                            "text/plain", "utf-8", new ByteArrayInputStream(new byte[0])
                        );
                    }
                }
            }
            return super.shouldInterceptRequest(view, request);
        }
    }
}
