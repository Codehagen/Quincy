import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/**
 * Vitest resolves its own module graph, so the `@/*` alias from tsconfig.json
 * has to be restated here — tsconfig paths are a type-level mapping and mean
 * nothing to the bundler at runtime.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.ts",
    ],
  },
})
