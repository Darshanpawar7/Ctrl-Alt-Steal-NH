import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createApp } from "../src/server/app";
import { GameServer } from "../src/server/game-server";
import { PostgresStore } from "../src/server/store";
import { applyAction } from "../src/server/game/actions";
import { createInitialState } from "../src/server/game/state";
import { ADMIN, T0 } from "./helpers";

// Runs the real Postgres store (the `pg` driver used in production with
// Neon) against real Postgres: PGlite, compiled to WebAssembly and served
// over the normal Postgres wire protocol.

let db: PGlite;
let pgServer: PGLiteSocketServer;
let url = "";

beforeAll(async () => {
  db = await PGlite.create();
  pgServer = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await pgServer.start();
  url = `postgres://postgres:postgres@${pgServer.getServerConn()}/postgres?sslmode=disable`;
}, 60_000);

afterAll(async () => {
  await pgServer.stop();
  await db.close();
});

const store = () => new PostgresStore(url, { maxConnections: 1 });
/**
 * PGlite's test server handles one connection at a time and resets a new one
 * that arrives the instant the previous one closes. Real Postgres (Neon) has
 * no such limit; the tests just give it a moment between restarts.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

async function startServer() {
  const s = store();
  const game = new GameServer(s, { adminPassword: "pw", volunteerPassword: "pw2" });
  await game.start();
  const http = createApp(game, { allowedOrigins: [], clientDir: null });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  return {
    base,
    async stop() {
      await game.shutdown();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await s.close();
    },
  };
}

describe("saving to Postgres", () => {
  test("only changed slices are written, and a state round-trips exactly", async () => {
    const a = store();
    expect((await a.load()).state).toBeNull();
    let s = createInitialState(T0);
    s = applyAction(s, { type: "team.add", team: { name: "Alpha", emoji: "🐝", members: [{ name: "A", srn: "" }], contact: "" }, checkIn: true }, ADMIN, T0).state;
    const teamId = s.teams[0]!.id;
    s = applyAction(s, { type: "board.notes", notes: "suspect the intern" }, { role: "team", teamId }, T0).state;
    a.save({ ...s, audit: [] });
    a.appendAudit(s.audit);
    await a.flush();
    expect(a.status()).toMatchObject({ ok: true, pending: false });

    const before = await db.query<{ key: string }>("SELECT key FROM cas_kv ORDER BY key");
    expect(before.rows.map((r) => r.key)).toEqual(["adjustments", `board:${teamId}`, "caseFile", "event", "feed", "hints", "meta", "rounds", "subs", "teams"]);

    // A board edit touches just that crew's board (and the small meta row).
    await db.query("UPDATE cas_kv SET updated_at = '2000-01-01'");
    s = applyAction(s, { type: "board.notes", notes: "definitely the intern" }, { role: "team", teamId }, T0 + 1).state;
    a.save({ ...s, audit: [] });
    await a.flush();
    const touched = await db.query<{ key: string }>("SELECT key FROM cas_kv WHERE updated_at > '2000-01-01' ORDER BY key");
    expect(touched.rows.map((r) => r.key)).toEqual([`board:${teamId}`, "meta"]);
    await a.close();
    await settle();

    const b = store();
    const loaded = await b.load();
    expect(loaded.state).toEqual({ ...s, audit: [] });
    expect(loaded.recentAudit.map((e) => e.type)).toEqual(["team.add"]);
    await b.close();
    await settle();
  });

  test("the full game server survives a restart on Postgres", async () => {
    const first = await startServer();
    const reg = await fetch(`${first.base}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Postgres Pirates", members: [{ name: "A" }, { name: "B" }, { name: "C" }] }),
    });
    const { team } = (await reg.json()) as { team: { code: string } };
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const up = await fetch(`${first.base}/api/admin/upload`, { method: "POST", headers: { Authorization: "Bearer pw", "Content-Type": "image/png" }, body: png });
    const { id } = (await up.json()) as { id: string };
    await first.stop();
    await settle();

    const second = await startServer();
    const info = (await (await fetch(`${second.base}/api/public`)).json()) as { teamCount: number };
    expect(info.teamCount).toBeGreaterThanOrEqual(1);
    const backup = JSON.parse(await (await fetch(`${second.base}/api/admin/backup`, { headers: { Authorization: "Bearer pw" } })).text());
    expect(backup.teams.some((t: { code: string }) => t.code === team.code)).toBe(true);
    expect(backup.audit.some((a: { summary: string }) => a.summary.includes("Postgres Pirates"))).toBe(true);
    const img = await fetch(`${second.base}/api/img/${id}`);
    expect(Buffer.from(await img.arrayBuffer()).equals(png)).toBe(true);
    const health = (await (await fetch(`${second.base}/api/health`)).json()) as { storage: { kind: string; ok: boolean } };
    expect(health.storage).toMatchObject({ kind: "postgres", ok: true });
    await second.stop();
  });
});
