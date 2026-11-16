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
    // Files share a worker instead of each getting a fresh one: the suite is
    // pure functions over mocks, and the setup file resets the module
    // registry between files so a `vi.mock` in one never reaches another.
    // Stubbed env and globals are restored after every test for the same
    // reason. If a file starts leaking state, fix the leak; do not turn
    // isolation back on.
    isolate: false,
    setupFiles: ["./vitest.setup.ts"],
    unstubEnvs: true,
    unstubGlobals: true,
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.ts",
    ],
  },
})
