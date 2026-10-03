import { AD_CLIENT } from "./ads";
import { ANDROID_PACKAGE_ID } from "./android";
import { ANDROID_APP_UA_TOKEN } from "./capacitor-identity";

/**
 * The AdSense script, loaded only outside the Android apps.
 *
 * It used to be a plain `<script async src=adsbygoogle.js>` in the root
 * layout, so it loaded inside the Capacitor WebView and the TWA as well.
 * `AdSlot` and the game ads already refuse to *place* anything there
 * (`isAndroidApp()`), but the script on its own is enough for Auto Ads to
 * place units the moment Auto Ads is switched on in the AdSense dashboard —
 * and AdSense inside a bare WebView is the "Valuable Inventory: Framed
 * Sites" violation docs/CAPACITOR.md §5 calls a launch blocker. A rule that
 * holds only while a dashboard toggle stays off is not a rule.
 *
 * So this is an inline script in `<head>` that decides before injecting: the
 * same three signals `app-mode.ts` reads (the Capacitor user-agent token, the
 * TWA's `android-app://` referrer, and the session flag that remembers it),
 * restated here because it has to run before React does. `ad-loader.test.ts`
 * executes this string, the way theme.test.ts executes the theme script.
 *
 * Site ownership for AdSense is verified by the `google-adsense-account`
 * meta tag in the root layout, which is unaffected.
 */
export const AD_SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;

/** Must match `KEY` in lib/app-mode.ts. */
const APP_SESSION_KEY = "sdg-android-app";

export function adLoaderScript(testAds: boolean): string {
  const j = JSON.stringify;
  return `(function(){try{
var inApp=(navigator.userAgent||"").indexOf(${j(ANDROID_APP_UA_TOKEN)})>=0;
if(!inApp&&(document.referrer||"").indexOf(${j(`android-app://${ANDROID_PACKAGE_ID}`)})===0)inApp=true;
if(!inApp){try{inApp=sessionStorage.getItem(${j(APP_SESSION_KEY)})==="1"}catch(e){}}
if(inApp)return;
var s=document.createElement("script");
s.async=true;s.src=${j(AD_SCRIPT_SRC)};s.crossOrigin="anonymous";
${testAds ? 's.setAttribute("data-adbreak-test","on");' : ""}
document.head.appendChild(s);
}catch(e){}})();`;
}
