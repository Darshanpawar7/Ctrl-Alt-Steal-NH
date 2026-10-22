import { defineConfig } from "vite";

// Bundles the game server (src/server) into dist-server/main.js for Node.
// Packages in node_modules (ws, pg, immer) stay external.
export default defineConfig({
  build: {
    ssr: "src/server/main.ts",
    outDir: "dist-server",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "main.js" } },
  },
});
