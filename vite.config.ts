import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The website. In development, /api (including the WebSocket) is forwarded
// to the local game server started by `npm run dev`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Small files are normally inlined as data: URLs, but the security policy (font-src 'self')
    // blocks fonts loaded that way, so fonts always stay separate files.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/.test(filePath) ? false : undefined),
  },
  server: {
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
