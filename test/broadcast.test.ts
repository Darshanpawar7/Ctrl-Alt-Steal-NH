import { describe, expect, test } from "vitest";
import { applyPatch, type Action, type View } from "../src/shared/protocol";
import type { GameState } from "../src/shared/types";
import { applyAction, type Actor } from "../src/worker/game/actions";
import { Broadcaster, recipientKey, type Recipient } from "../src/worker/game/broadcast";
import { buildContext, publicView, staffView, teamView } from "../src/worker/game/views";
import { ADMIN, T0, act, gameWith, idOf, setStatus, teamActor } from "./helpers";

const presence = { screens: 1, staff: 2, teams: {} };
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function setup() {
  const s = setStatus(gameWith(["Alpha", "Bravo"]), "r1", "open");
  const recipients: Recipient[] = [
    { role: "screen", teamId: null },
    { role: "team", teamId: idOf(s, "Alpha") },
    { role: "team", teamId: idOf(s, "Bravo") },
    { role: "admin", teamId: null },
    { role: "volunteer", teamId: null },
  ];
  return { s, recipients };
}

function truth(s: GameState, r: Recipient): View {
  const ctx = buildContext(s, presence);
  if (r.role === "screen") return publicView(s, ctx);
  if (r.role === "team") return teamView(s, ctx, r.teamId!)!;
  return staffView(s, ctx, r.role as "admin" | "volunteer");
}

/** A fake set of connected screens that apply messages exactly like the browser client. */
class Room {
  readonly screens = new Map<string, View>();
  readonly b = new Broadcaster();
  bytes = 0;
  constructor(s: GameState, readonly recipients: Recipient[]) {
    for (const r of recipients) this.screens.set(recipientKey(r), JSON.parse(this.b.snapshot(s, presence, r, 0)!).view);
  }
  push(s: GameState): string[] {
    const out = this.b.changed(s, presence, this.recipients, 1);
    for (const [key, raw] of out) {
      const msg = JSON.parse(raw);
      expect(msg.t).toBe("patch");
      this.bytes += raw.length;
      this.screens.set(key, applyPatch(this.screens.get(key)!, msg.view));
    }
    return [...out.keys()].sort();
  }
}

describe("the broadcaster", () => {
  test("replayed patches always equal the full view each role may see", () => {
    let { s, recipients } = setup();
    const room = new Room(s, recipients);
    room.push(s);
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
      for (const r of recipients) expect(room.screens.get(recipientKey(r))).toEqual(plain(truth(s, r)));
    }
  });

  test("nothing is re-sent when nothing changed", () => {
    const { s, recipients } = setup();
    const room = new Room(s, recipients);
    room.push(s);
    expect(room.push(s)).toEqual([]);
  });

  test("a crew's auto-save only reaches its own phones and staff, and carries no shared content", () => {
    const { s, recipients } = setup();
    const room = new Room(s, recipients);
    let next = act(s, { type: "sub.save", roundId: "r1", data: { stakes: { l1: 100 } } }, teamActor(s, "Alpha"));
    room.push(next);
    next = act(next, { type: "sub.save", roundId: "r1", data: { stakes: { l1: 150 } } }, teamActor(s, "Alpha"));
    const out = room.b.changed(next, presence, recipients, 2);
    expect([...out.keys()].sort()).toEqual(["admin", `team:${idOf(s, "Alpha")}`, "volunteer"]);
    expect(Object.keys(JSON.parse(out.get(`team:${idOf(s, "Alpha")}`)!).view)).toEqual(["kind", "me"]);
    expect(Object.keys(JSON.parse(out.get("admin")!).view)).toEqual(["kind", "staff"]);
  });

  test("a board mark reaches only that crew", () => {
    const { s, recipients } = setup();
    const room = new Room(s, recipients);
    room.push(s);
    expect(room.push(act(s, { type: "board.mark", key: "s:root", mark: "prime" }, teamActor(s, "Alpha")))).toEqual([`team:${idOf(s, "Alpha")}`]);
  });

  test("an announcement reaches every screen with only the changed sections", () => {
    const { s, recipients } = setup();
    const room = new Room(s, recipients);
    room.push(s);
    const next = act(s, { type: "announce", text: "Two minutes left!" });
    const out = room.b.changed(next, presence, recipients, 2);
    expect([...out.keys()].sort()).toEqual([...new Set(recipients.map(recipientKey))].sort());
    expect(Object.keys(JSON.parse(out.get("screen")!).view).sort()).toEqual(["feed", "kind", "live"]);
  });

  test("a screen that joins mid-game gets everything, and its group is resynced", () => {
    const { s, recipients } = setup();
    const b = new Broadcaster();
    b.changed(s, presence, recipients, 1);
    const late = JSON.parse(b.snapshot(s, presence, { role: "team", teamId: idOf(s, "Bravo") }, 3)!);
    expect(late.t).toBe("state");
    expect(late.view).toEqual(plain(truth(s, { role: "team", teamId: idOf(s, "Bravo") })));
    const next = b.changed(s, presence, recipients, 4);
    expect([...next.keys()]).toEqual([`team:${idOf(s, "Bravo")}`]);
  });
});
