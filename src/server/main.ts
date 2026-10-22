// Game server entry point. Runs on Render (or any Node 22+ host, or a
// laptop). Configuration comes from environment variables:
//
//   ADMIN_PASSWORD, VOLUNTEER_PASSWORD   staff sign-in
//   DATABASE_URL                         Postgres (e.g. Neon). Without it, saves to ./.data
//   ALLOWED_ORIGINS                      the website's address(es), comma separated
//   PORT                                 set by Render automatically
//   SERVE_CLIENT=false                   don't serve dist/ (API only)

import { existsSync } from "node:fs";
import { createApp, parseOrigins } from "./app";
import { GameServer } from "./game-server";
import { FileStore, PostgresStore } from "./store";

// On a laptop, settings come from .env. On Render they are real environment variables.
if (existsSync(".env")) process.loadEnvFile(".env");

const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);
const clientDir = process.env.SERVE_CLIENT !== "false" && existsSync("dist/index.html") ? "dist" : null;
const store = process.env.DATABASE_URL
  ? new PostgresStore(process.env.DATABASE_URL, { maxConnections: Number(process.env.PG_POOL_MAX ?? 4) })
  : new FileStore(process.env.DATA_DIR ?? ".data");
const game = new GameServer(store, { adminPassword: process.env.ADMIN_PASSWORD, volunteerPassword: process.env.VOLUNTEER_PASSWORD });

// Start listening straight away (so Render sees the service is up), but only
// serve the game once the saved state has loaded. If the database can't be
// reached yet (waking up, paused, network blip), keep retrying instead of
// crashing, and never start from an empty game that could overwrite it.
const server = createApp(game, { allowedOrigins, clientDir });
server.listen(port, () => {
  console.log(`[ctrl-alt-steal] listening on port ${port} · storage: ${store.kind}${clientDir ? " · serving the website from dist/" : ""}`);
  if (!process.env.ADMIN_PASSWORD) console.warn("[ctrl-alt-steal] ADMIN_PASSWORD is not set: nobody can open the admin panel.");
  if (!process.env.DATABASE_URL && process.env.RENDER) console.warn("[ctrl-alt-steal] DATABASE_URL is not set: the game is NOT saved and will be lost on restart.");
  if (!allowedOrigins.length) console.warn("[ctrl-alt-steal] ALLOWED_ORIGINS is not set: any website may call this server.");
});
for (let attempt = 1; ; attempt++) {
  try {
    await game.start();
    console.log("[ctrl-alt-steal] saved game loaded, ready to play");
    break;
  } catch (error) {
    const wait = Math.min(30, attempt * 2);
    console.error(`[ctrl-alt-steal] could not load the saved game (attempt ${attempt}), retrying in ${wait}s:`, error instanceof Error ? error.message : error);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }
}

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[ctrl-alt-steal] ${signal}: saving and shutting down…`);
  server.close();
  await game.shutdown();
  await store.close();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
