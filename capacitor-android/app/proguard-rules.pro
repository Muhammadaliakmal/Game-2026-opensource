# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# ---------------------------------------------------------------------------
# Spec Driven Games
#
# R8 is on for release builds — see app/build.gradle for why (Play grades an
# upload on shrinking and obfuscation, and a WebView shell otherwise scores
# near zero). These are the rules that belong to this project.
#
# Capacitor's own keep rules are NOT repeated here. `@capacitor/android`
# declares them as `consumerProguardFiles`, so every plugin annotated with
# `@CapacitorPlugin` and everything extending `com.getcapacitor.Plugin` is
# already kept by the library itself. Copying them would be a second copy to
# keep in step with an upgrade.
# ---------------------------------------------------------------------------

# A crash report from a minified build is a stack of `a.b.c(Unknown Source)`
# unless these survive. They cost a few KB and they are the difference between
# a report that names a line and one nobody can act on.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
