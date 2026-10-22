import { describe, expect, test } from "vitest";
import { applyPatch, type Action, type View } from "../src/shared/protocol";
import type { GameState } from "../src/shared/types";
import { applyAction, type Actor } from "../src/server/game/actions";
import { Broadcaster, type Connection, type Recipient } from "../src/server/game/broadcast";
import { buildContext, publicView, staffView, teamView } from "../src/server/game/views";
import { ADMIN, T0, act, gameWith, idOf, setStatus, teamActor } from "./helpers";

const presence = { screens: 1, staff: 2, teams: {} };
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function setup() {
  const s = setStatus(gameWith(["Alpha", "Bravo"]), "r1", "open");
  const recipients: Recipient[] = [
    { role: "screen", teamId: null },
    { role: "team", teamId: idOf(s, "Alpha") },
    { role: "team", teamId: idOf(s, "Alpha") },
    { role: "team", teamId: idOf(s, "Bravo") },
    { role: "admin", teamId: null },
    { role: "volunteer", teamId: null },
  ];
  const connections: Connection[] = recipients.map((recipient, i) => ({ id: { i }, recipient }));
  return { s, connections };
}

function truth(s: GameState, r: Recipient): View {
  const ctx = buildContext(s, presence);
  if (r.role === "screen") return publicView(s, ctx);
  if (r.role === "team") return teamView(s, ctx, r.teamId!)!;
  return staffView(s, ctx, r.role as "admin" | "volunteer");
}

/** Connected screens that apply messages exactly like the browser client. */
class Room {
  readonly views = new Map<Connection, View>();
  readonly b = new Broadcaster();
  constructor(s: GameState, readonly connections: Connection[]) {
    for (const c of connections) this.views.set(c, JSON.parse(this.b.snapshot(s, presence, c, 0)!).view);
  }
  push(s: GameState): Connection[] {
    const out = this.b.changed(s, presence, this.connections, 1);
    const reached: Connection[] = [];
    for (const c of this.connections) {
      const raw = out.get(c.id);
      if (!raw) continue;
      const msg = JSON.parse(raw);
      expect(msg.t).toBe("patch");
      this.views.set(c, applyPatch(this.views.get(c)!, msg.view));
      reached.push(c);
    }
    return reached;
  }
}

describe("the broadcaster", () => {
  test("replayed patches always equal the full view each role may see", () => {
    let { s, connections } = setup();
    const room = new Room(s, connections);
    const steps: [Action, Actor][] = [
      [{ type: "sub.save", roundId: "r1", data: { stakes: { l1: 100 } } }, teamActor(s, "Alpha")],
      [{ type: "board.mark", key: "s:root", mark: "prime" }, teamActor(s, "Bravo")],
      [{ type: "announce", text: "One minute!" }, ADMIN],
      [{ type: "round.set", roundId: "r1", status: "revealed" }, ADMIN],
      [{ type: "adj.add", teamId: idOf(s, "Bravo"), amount: 50, reason: "Bonus", afterRound: "r1" }, ADMIN],
      [{ type: "live.leaderboard", hidden: true }, ADMIN],
      [{ type: "content.set", section: "r2", value: { ...s.rounds.r2, title: "The Training Log v2" } }, ADMIN],
      [{ type: "live.leaderboard", hidden: false }, ADMIN],
    ];
    for (const [action, actor] of steps) {
      s = applyAction(s, action, actor, T0).state;
      room.push(s);
      for (const c of connections) expect(room.views.get(c)).toEqual(plain(truth(s, c.recipient)));
    }
  });

  test("nothing is re-sent when nothing changed", () => {
    const { s, connections } = setup();
    const room = new Room(s, connections);
    expect(room.push(s)).toEqual([]);
  });

  test("a crew's auto-save only reaches its own phones and staff, and carries no shared content", () => {
    const { s, connections } = setup();
    const room = new Room(s, connections);
    let next = act(s, { type: "sub.save", roundId: "r1", data: { stakes: { l1: 100 } } }, teamActor(s, "Alpha"));
    room.push(next);
    next = act(next, { type: "sub.save", roundId: "r1", data: { stakes: { l1: 150 } } }, teamActor(s, "Alpha"));
    const out = room.b.changed(next, presence, connections, 2);
    const reached = connections.filter((c) => out.has(c.id)).map((c) => c.recipient.role);
    expect(reached.sort()).toEqual(["admin", "team", "team", "volunteer"]);
    expect(Object.keys(JSON.parse(out.get(connections[1]!.id)!).view)).toEqual(["kind", "me"]);
    expect(Object.keys(JSON.parse(out.get(connections[4]!.id)!).view)).toEqual(["kind", "staff"]);
  });

  test("a board mark reaches only that crew", () => {
    const { s, connections } = setup();
    const room = new Room(s, connections);
    const reached = room.push(act(s, { type: "board.mark", key: "s:root", mark: "prime" }, teamActor(s, "Alpha")));
    expect(reached.map((c) => c.recipient.teamId)).toEqual([idOf(s, "Alpha"), idOf(s, "Alpha")]);
  });

  test("an announcement reaches every screen with only the changed sections", () => {
    const { s, connections } = setup();
    const room = new Room(s, connections);
    const next = act(s, { type: "announce", text: "Two minutes left!" });
    const out = room.b.changed(next, presence, connections, 2);
    expect(out.size).toBe(connections.length);
    expect(Object.keys(JSON.parse(out.get(connections[0]!.id)!).view).sort()).toEqual(["feed", "kind", "live"]);
  });

  test("a phone that reconnects gets everything, and nobody else is resent anything", () => {
    const { s, connections } = setup();
    const room = new Room(s, connections);
    const rejoined: Connection = { id: { rejoined: true }, recipient: connections[3]!.recipient };
    const late = JSON.parse(room.b.snapshot(s, presence, rejoined, 3)!);
    expect(late.t).toBe("state");
    expect(late.view).toEqual(plain(truth(s, rejoined.recipient)));
    expect(room.b.changed(s, presence, [...connections, rejoined], 4).size).toBe(0);
  });
});
