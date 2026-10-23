// Checks a DATABASE_URL before you deploy: connects the same way the game
// server does, creates its tables, and reports any problem in plain words.
//
//   npx tsx scripts/check-database.ts "<connection string>"
//
// (or set DATABASE_URL in .env and run it with no argument)

import { existsSync } from "node:fs";
import { PostgresStore } from "../src/server/store";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.log('Usage: npx tsx scripts/check-database.ts "<connection string>"');
  process.exit(1);
}

const store = new PostgresStore(url, { maxConnections: 1, caCert: process.env.DATABASE_CA_CERT });
const started = Date.now();
try {
  const loaded = await store.load();
  console.log(`✅ Connected in ${Date.now() - started} ms. Tables are ready.`);
  console.log(loaded.state ? `   A saved game was found (${loaded.state.teams.length} crews).` : "   No saved game yet: it will be created on first start.");
} catch (error) {
  console.log(`❌ Could not use this database:\n   ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await store.close();
}
