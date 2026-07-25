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
    // Scratch/output dir: a standalone CommonJS slide-build script and its own
    // node_modules, plus uploaded storage — not application source.
    "var/**",
    // Claude Code session worktrees — full checkouts of this repo made by
    // other sessions; linting them duplicates (stale copies of) every finding.
    ".claude/**",
  ]),
]);

export default eslintConfig;
