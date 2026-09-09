import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // `txt` is in this list for ads.txt and robots.txt. Both are fetched by
    // Google's crawlers rather than by a browser, and a static file in
    // public/ has no session to attach — running them through auth
    // middleware only adds latency to the two requests an ad review depends
    // on. Everything else here is excluded for the same reason.
    "/((?!_next|[^?]*\\.(?:html?|css|txt|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
