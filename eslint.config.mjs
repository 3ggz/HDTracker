import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored minified pdf.js worker — not our code; linting a 1 MB
    // minified bundle burns seconds and spews no-this-alias noise.
    "public/pdf.worker.min.mjs",
    // Capacitor native shells + offline fallback (generated).
    "ios/**",
    "android/**",
    "mobile/**",
  ]),
]);

export default eslintConfig;
