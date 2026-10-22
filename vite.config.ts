import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The website. In development, /api (including the WebSocket) is forwarded
// to the local game server started by `npm run dev`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
