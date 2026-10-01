import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /*
     * An underscore prefix means "deliberately unused", and now actually does.
     *
     * The codebase already writes `_difficulty` for a parameter a particular
     * implementation ignores but the interface requires — `scoreMove` in the
     * Ludo and Snakes bot rules, where the signature is shared with cabinets
     * that do use it. `eslint-config-next` ships `no-unused-vars` without an
     * ignore pattern, so the convention was being followed and warned about
     * at the same time, leaving two permanent warnings in a clean lint run.
     *
     * Two permanent warnings is worse than it sounds: it makes "lint is clean"
     * stop meaning anything, and the next real warning arrives in a report
     * that already has noise in it.
     */
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gradle output and vendored agent-skill templates: generated or someone
    // else's code, and the only warnings a clean lint run was reporting.
    "capacitor-android/**/build/**",
    "android/**/build/**",
    ".agents/**",
  ]),
]);

export default eslintConfig;
