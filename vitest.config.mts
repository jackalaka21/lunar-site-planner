import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Component tests opt into the DOM with `// @vitest-environment jsdom`.
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
