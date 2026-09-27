import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // TypeScript emits declarations and JS here; only run the source tests.
    exclude: [...configDefaults.exclude, "**/dist-types/**"],
  },
});
