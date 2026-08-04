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
    // packages/* is main's original, never-completed npm-workspace
    // scaffold (from the initial commit, before the rahul merge) — kept
    // on disk for reference, not wired to the real app in src/, and not
    // its own linted/typed project.
    "packages/**",
    "vitest.config.ts",
  ]),
]);

export default eslintConfig;
