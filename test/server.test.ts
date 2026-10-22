import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import WebSocket from "ws";
import type { Action, ServerMessage, View } from "../src/shared/protocol";
import { applyPatch } from "../src/shared/protocol";
import { createApp } from "../src/server/app";
import { GameServer } from "../src/server/game-server";
import { FileStore } from "../src/server/store";

// End-to-end tests of the real Node server: HTTP routes, WebSockets, CORS and
// saving to disk across a restart.

const ADMIN_PW = "admin-pw";
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function start(dir: string | null, allowedOrigins: string[] = []) {
  const store = new FileStore(dir);
  const game = new GameServer(store, { adminPassword: ADMIN_PW, volunteerPassword: "desk-pw" });
  await game.start();
  const server = createApp(game, { allowedOrigins, clientDir: null });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await game.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  cleanups.push(stop);
  return { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/api/ws`, stop };
}

/** A WebSocket client that keeps a merged view, like the browser does. */
async function connect(url: string, hello: object, origin?: string) {
  const ws = new WebSocket(url, origin ? { origin } : {});
  cleanups.push(() => ws.close());
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  let view: View | null = null;
  ws.on("message", (raw) => {
    const text = raw.toString();
    if (text === "pong") return;
    const message = JSON.parse(text) as ServerMessage;
    if (message.t === "state") view = message.view;
    if (message.t === "patch" && view) view = applyPatch(view, message.view);
    inbox.push(message);
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
    ws.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
  ws.send(JSON.stringify({ t: "hello", ...hello }));
  let seq = 0;
  const waitFor = async <T,>(check: () => T | undefined, ms = 3000): Promise<T> => {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = check();
      if (found !== undefined) return found;
      if (Date.now() > deadline) throw new Error("timed out waiting for the server");
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  };
  return {
    get view() {
      return view;
    },
    first: (t: ServerMessage["t"]) => waitFor(() => inbox.find((m) => m.t === t)),
    until: (check: (v: View) => boolean) => waitFor(() => (view && check(view) ? view : undefined)),
    async act(action: Action) {
      const id = String(++seq);
      ws.send(JSON.stringify({ t: "act", id, action }));
      return waitFor(() => inbox.find((m) => m.t === "ack" && m.id === id) as Extract<ServerMessage, { t: "ack" }> | undefined);
    },
  };
}

const member = (name: string) => ({ name, srn: "" });

async function registerCrew(http: string, name: string) {
  const res = await fetch(`${http}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, members: [member("A"), member("B"), member("C")] }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { team: { code: string } }).team.code;
}

describe("the game server", () => {
  test("health, public info and registration over HTTP", async () => {
    const s = await start(null);
    const health = (await (await fetch(`${s.http}/api/health`)).json()) as { ok: boolean; storage: { kind: string } };
    expect(health).toMatchObject({ ok: true, storage: { kind: "memory" } });
    const info = (await (await fetch(`${s.http}/api/public`)).json()) as { teamCount: number };
    expect(info.teamCount).toBe(0);
    expect(await registerCrew(s.http, "Honey Heisters")).toMatch(/^[A-Z2-9]{6}$/);
    expect(((await (await fetch(`${s.http}/api/public`)).json()) as { teamCount: number }).teamCount).toBe(1);
  });

  test("a full round trip: staff and a crew play live over WebSockets", async () => {
    const s = await start(null);
    const code = await registerCrew(s.http, "Byte Bandits");
    const bad = await connect(s.ws, { role: "admin", password: "nope" });
    expect(await bad.first("denied")).toMatchObject({ reason: "Wrong password." });

    const admin = await connect(s.ws, { role: "admin", password: ADMIN_PW });
    const staff = await admin.until((v) => v.kind === "staff");
    const teamId = staff.kind === "staff" ? staff.staff.teams[0]!.id : "";
    const crew = await connect(s.ws, { role: "team", code: code.toLowerCase() });
    await crew.until((v) => v.kind === "team");

    expect((await crew.act({ type: "sub.save", roundId: "r1", data: { stakes: { l1: 100 } } })).ok).toBe(false);
    expect((await admin.act({ type: "team.checkin", id: teamId, value: true })).ok).toBe(true);
    expect((await admin.act({ type: "round.set", roundId: "r1", status: "open" })).ok).toBe(true);
    await crew.until((v) => v.status.r1 === "open");
    expect((await crew.act({ type: "sub.save", roundId: "r1", data: { stakes: { l1: 200 } } })).ok).toBe(true);
    expect((await admin.act({ type: "round.set", roundId: "r1", status: "revealed" })).ok).toBe(true);
    const after = await crew.until((v) => v.kind === "team" && v.me.credits !== 1000);
    expect(after.kind === "team" && after.me.credits).toBe(1100);
    // The crew never sees answer keys before a reveal, nor admin-only data.
    expect(JSON.stringify(crew.view)).not.toContain('"full"');
  });

  test("only the configured website may call the server", async () => {
    const s = await start(null, ["https://ctrl-alt-steal.vercel.app"]);
    const ok = await fetch(`${s.http}/api/public`, { headers: { Origin: "https://ctrl-alt-steal.vercel.app" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://ctrl-alt-steal.vercel.app");
    const other = await fetch(`${s.http}/api/public`, { headers: { Origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    await expect(connect(s.ws, { role: "screen" }, "https://evil.example")).rejects.toThrow(/403/);
    const screen = await connect(s.ws, { role: "screen" }, "https://ctrl-alt-steal.vercel.app");
    expect((await screen.until((v) => v.kind === "public")).kind).toBe("public");
  });

  test("admin routes need the password; uploads, backups and restores work", async () => {
    const s = await start(null);
    await registerCrew(s.http, "Null Pointers");
    const auth = { Authorization: `Bearer ${ADMIN_PW}` };
    expect((await fetch(`${s.http}/api/admin/backup`)).status).toBe(401);

    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const up = (await (await fetch(`${s.http}/api/admin/upload`, { method: "POST", headers: { ...auth, "Content-Type": "image/png" }, body: png })).json()) as { id: string };
    const img = await fetch(`${s.http}/api/img/${up.id}`);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await img.arrayBuffer()).equals(png)).toBe(true);

    const backup = await (await fetch(`${s.http}/api/admin/backup`, { headers: auth })).text();
    expect(JSON.parse(backup).teams).toHaveLength(1);
    await registerCrew(s.http, "Kernel Panic");
    const restored = await fetch(`${s.http}/api/admin/restore`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: backup });
    expect(restored.status).toBe(200);
    expect(((await (await fetch(`${s.http}/api/public`)).json()) as { teamCount: number }).teamCount).toBe(1);
  });

  test("nothing is lost when the server restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cas-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const first = await start(dir);
    await registerCrew(first.http, "Tensor Thieves");
    const admin = await connect(first.ws, { role: "admin", password: ADMIN_PW });
    const staff = await admin.until((v) => v.kind === "staff");
    const teamId = staff.kind === "staff" ? staff.staff.teams[0]!.id : "";
    await admin.act({ type: "adj.add", teamId, amount: 77, reason: "Saved before restart", afterRound: null });
    await admin.act({ type: "round.set", roundId: "r1", status: "intro" });
    await first.stop();

    const second = await start(dir);
    const again = await connect(second.ws, { role: "admin", password: ADMIN_PW });
    const view = await again.until((v) => v.kind === "staff");
    if (view.kind !== "staff") throw new Error("expected staff view");
    expect(view.staff.teams.map((t) => t.name)).toEqual(["Tensor Thieves"]);
    expect(view.staff.ledgers[teamId]!.total).toBe(1077);
    expect(view.status.r1).toBe("intro");
    expect(view.staff.audit.some((a) => a.summary.includes("Saved before restart"))).toBe(true);
  });
});
