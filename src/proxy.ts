import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // `txt` is in this list for ads.txt and robots.txt. Both are fetched by
    // Google's crawlers rather than by a browser, and a static file in
    // public/ has no session to attach — running them through auth
    // middleware only adds latency to the two requests an ad review depends
    // on. Everything else here is excluded for the same reason.
    //
    // `.well-known` is excluded on a stronger version of the same argument.
    // Android's asset-link verifier fetches `/.well-known/assetlinks.json`
    // with no cookies and **does not follow redirects**: anything that hands
    // it a 3xx instead of the file is not a slow path, it is a failed domain
    // verification, and the app then opens with a browser address bar over
    // the HUD. Auth middleware has no business on that request at all.
    "/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|txt|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
