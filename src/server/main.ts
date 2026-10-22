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

await game.start();
const server = createApp(game, { allowedOrigins, clientDir });
server.listen(port, () => {
  console.log(`[ctrl-alt-steal] game server on port ${port} · storage: ${store.kind}${clientDir ? " · serving the website from dist/" : ""}`);
  if (!process.env.ADMIN_PASSWORD) console.warn("[ctrl-alt-steal] ADMIN_PASSWORD is not set: nobody can open the admin panel.");
  if (!process.env.DATABASE_URL && process.env.RENDER) console.warn("[ctrl-alt-steal] DATABASE_URL is not set: the game is NOT saved and will be lost on restart.");
  if (!allowedOrigins.length) console.warn("[ctrl-alt-steal] ALLOWED_ORIGINS is not set: any website may call this server.");
});

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
