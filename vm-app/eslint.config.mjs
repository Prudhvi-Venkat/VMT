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
    // Node built-in test runner files are not part of the Next.js app graph.
    "tests/**",
  ]),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api-client",
              message: "lib/api-client is decommissioned. Import endpoints, hooks, or ApiError from '@/lib/store/api' instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
