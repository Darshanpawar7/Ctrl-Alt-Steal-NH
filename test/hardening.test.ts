import { describe, expect, test } from "vitest";
import type { Action } from "../src/shared/protocol";
import { applyAction } from "../src/server/game/actions";
import { computeLedgers } from "../src/server/game/scoring";
import { buildContext, publicView, teamView } from "../src/server/game/views";
import { ADMIN, T0, VOLUNTEER, act, gameWith, idOf, setStatus, submit, teamActor } from "./helpers";

// Regression tests for issues found in the security review.

const presence = { screens: 0, staff: 0, teams: {} };

describe("hint purchases only accept real hint numbers", () => {
  test.each(["constructor", "0", [0], 1.5, -1, 99])("index %j is refused and credits stay a number", (index) => {
    const s = setStatus(gameWith(["Alpha"]), "r2", "open");
    const action = { type: "hint.buy", roundId: "r2", index } as unknown as Action;
    expect(() => applyAction(s, action, teamActor(s, "Alpha"), T0)).toThrow(/does not exist/);
  });

  test("bad indexes already in a backup are ignored when scoring", () => {
    let s = setStatus(gameWith(["Alpha"]), "r2", "open");
    s = { ...s, hints: { ...s.hints, r2: { [idOf(s, "Alpha")]: ["constructor", 0, 0] as unknown as number[] } } };
    expect(computeLedgers(s)[idOf(s, "Alpha")]!.total).toBe(925);
  });
});

describe("the deduction board", () => {
  test("only accepts one exact key per real option", () => {
    const s = gameWith(["Alpha"]);
    const mark = (key: string) => act(s, { type: "board.mark", key, mark: "maybe" }, teamActor(s, "Alpha"));
    expect(() => mark("s:root:0")).toThrow(/Unknown board entry/);
    expect(() => mark("s:nobody")).toThrow(/Unknown board entry/);
    expect(mark("s:root").boards[idOf(s, "Alpha")]!.marks).toEqual({ "s:root": "maybe" });
  });
});

describe("the vault", () => {
  test("a team cannot pick a door without wagering at least the minimum", () => {
    const s = setStatus(gameWith(["Alpha"]), "r4", "open");
    expect(() => submit(s, "Alpha", "r4", { choice: "vault", door: "A", wager: 0 })).toThrow(/minimum wager/);
  });

  test("a zero wager entered by staff counts as banking and earns no bonus clue", () => {
    let s = setStatus(gameWith(["Alpha"]), "r4", "open");
    s = act(s, { type: "vault.assign", door: "A", prizeIndex: 0 });
    s = act(s, { type: "sub.staffSet", roundId: "r4", teamId: idOf(s, "Alpha"), data: { choice: "vault", door: "A", wager: 0 }, lock: true });
    s = setStatus(s, "r4", "locked");
    s = act(s, { type: "vault.open", door: "A" });
    const ctx = buildContext(s, presence);
    expect(teamView(s, ctx, idOf(s, "Alpha"))!.me.bonusClue).toBeNull();
    expect(publicView(s, ctx).stats.vaultBanked).toEqual([idOf(s, "Alpha")]);
  });
});

describe("the final reveal", () => {
  test("entering the reveal always starts from the first beat", () => {
    let s = setStatus(gameWith(["Alpha"]), "finale", "open");
    s = act(s, { type: "live.revealStep", step: 5 }); // e.g. left over from a rehearsal
    s = act(s, { type: "stage.set", stage: "finalReveal" });
    expect(s.live.revealStep).toBe(0);
    expect(publicView(s, buildContext(s, presence)).caseFile.solution.thiefId).toBeUndefined();
  });
});

describe("check-in", () => {
  test("volunteers can't undo a check-in once the game has started, admins can", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "intro");
    expect(() => act(s, { type: "team.checkin", id: idOf(s, "Alpha"), value: false }, VOLUNTEER)).toThrow(/club head/);
    s = act(s, { type: "team.checkin", id: idOf(s, "Alpha"), value: false }, ADMIN);
    expect(s.teams[0]!.checkedIn).toBe(false);
    s = act(s, { type: "team.checkin", id: idOf(s, "Alpha"), value: true }, VOLUNTEER);
    expect(s.teams[0]!.checkedIn).toBe(true);
  });
});

describe("budgets", () => {
  test("hints bought in a round come out of that round's staking budget", () => {
    let s = gameWith(["Alpha"]);
    s = act(s, { type: "content.set", section: "r1", value: { ...s.rounds.r1, maxStake: 1000, hints: [{ text: "psst", cost: 300 }] } });
    s = setStatus(s, "r1", "open");
    s = act(s, { type: "hint.buy", roundId: "r1", index: 0 }, teamActor(s, "Alpha"));
    expect(() => submit(s, "Alpha", "r1", { stakes: { l2: 800 } })).toThrow(/at most 700/);
    s = submit(s, "Alpha", "r1", { stakes: { l2: 700 } });
    s = setStatus(s, "r1", "revealed");
    expect(computeLedgers(s)[idOf(s, "Alpha")]!.total).toBe(0);
  });
});

describe("what the public screen can see", () => {
  test("never member names, and no suspect dossiers before the briefing", () => {
    let s = gameWith(["Alpha"]);
    s = act(s, { type: "team.update", id: idOf(s, "Alpha"), team: { name: "Alpha", emoji: "🐝", members: [{ name: "Priya Secretname", srn: "PES1UG99" }], contact: "" } });
    let view = publicView(s, buildContext(s, presence));
    expect(JSON.stringify(view)).not.toContain("Secretname");
    expect(view.caseFile.suspects.every((x) => x.bio === "" && x.traits.length === 0)).toBe(true);
    expect(view.caseFile.locations).toEqual([]);
    s = act(s, { type: "stage.set", stage: "briefing" });
    view = publicView(s, buildContext(s, presence));
    expect(view.caseFile.suspects[0]!.traits.length).toBeGreaterThan(0);
    expect(view.caseFile.locations.length).toBeGreaterThan(0);
  });
});
