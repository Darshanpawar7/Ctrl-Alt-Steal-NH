import { defineConfig } from "vitest/config";

// Tests cover the pure game engine only, so they run in plain Node
// without the Cloudflare or React plugins.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
