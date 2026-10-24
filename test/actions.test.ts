import { describe, expect, test } from "vitest";
import type { Action } from "../src/shared/protocol";
import { applyAction, registerTeam } from "../src/server/game/actions";
import { createInitialState, restoreState, tick } from "../src/server/game/state";
import { ADMIN, T0, VOLUNTEER, act, gameWith, idOf, setStatus, submit, teamActor } from "./helpers";

describe("permissions", () => {
  test("teams and volunteers cannot run the show", () => {
    const s = gameWith(["Alpha"]);
    expect(() => applyAction(s, { type: "round.set", roundId: "r1", status: "open" }, teamActor(s, "Alpha"), T0)).toThrow(/not allowed/);
    expect(() => applyAction(s, { type: "round.set", roundId: "r1", status: "open" }, VOLUNTEER, T0)).toThrow(/not allowed/);
    expect(() => applyAction(s, { type: "content.set", section: "r1", value: {} }, VOLUNTEER, T0)).toThrow(/not allowed/);
  });

  test("volunteers can check teams in and enter paper answers until the reveal", () => {
    let s = gameWith(["Alpha"]);
    s = act(s, { type: "team.checkin", id: idOf(s, "Alpha"), value: false }, VOLUNTEER);
    expect(s.teams[0]!.checkedIn).toBe(false);
    s = setStatus(s, "r3", "locked");
    s = act(s, { type: "sub.staffSet", roundId: "r3", teamId: idOf(s, "Alpha"), data: { calls: { e1: "real" } }, lock: true }, VOLUNTEER);
    expect(s.subs.r3[idOf(s, "Alpha")]!.by).toBe("volunteer");
    s = setStatus(s, "r3", "revealed");
    expect(() => act(s, { type: "sub.staffSet", roundId: "r3", teamId: idOf(s, "Alpha"), data: {}, lock: true }, VOLUNTEER)).toThrow(/admin/);
  });
});

describe("team submissions", () => {
  test("only accepted while the round is open and the team is checked in", () => {
    let s = gameWith(["Alpha"]);
    expect(() => submit(s, "Alpha", "r1", { stakes: {} })).toThrow(/not open/);
    s = setStatus(s, "r1", "open");
    s = act(s, { type: "team.checkin", id: idOf(s, "Alpha"), value: false });
    expect(() => submit(s, "Alpha", "r1", { stakes: {} })).toThrow(/Check in/);
  });

  test("locking in freezes the answer", () => {
    let s = setStatus(gameWith(["Alpha"]), "r2", "open");
    s = submit(s, "Alpha", "r2", { answers: { q1: "1" } }, { lock: true });
    expect(() => submit(s, "Alpha", "r2", { answers: { q1: "2" } })).toThrow(/already locked/);
    s = act(s, { type: "sub.unlock", roundId: "r2", teamId: idOf(s, "Alpha") });
    s = submit(s, "Alpha", "r2", { answers: { q1: "2" } });
    expect(s.subs.r2[idOf(s, "Alpha")]!.data.answers.q1).toBe("2");
  });

  test("unknown ids in a submission are dropped", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = submit(s, "Alpha", "r1", { stakes: { l1: 100, hacked: 999, l2: -50 } });
    expect(s.subs.r1[idOf(s, "Alpha")]!.data.stakes).toEqual({ l1: 100 });
  });

  test("applyAction never mutates the state it is given", () => {
    const s = setStatus(gameWith(["Alpha"]), "r1", "open");
    const before = JSON.stringify(s);
    submit(s, "Alpha", "r1", { stakes: { l1: 100 } });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("the clock", () => {
  test("opening a round starts its timer and locks any other open round", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = setStatus(s, "r2", "open", T0 + 5000);
    expect(s.status.r1).toBe("locked");
    expect(s.live.timer.endsAt).toBe(T0 + 5000 + 900_000);
  });

  test("the alarm locks the round when time runs out", () => {
    const s = setStatus(gameWith(["Alpha"]), "r1", "open");
    expect(tick(s, T0 + 599_000)).toBeNull();
    const locked = tick(s, T0 + 600_000)!;
    expect(locked.status.r1).toBe("locked");
  });

  test("submissions after the buzzer are rejected even before the alarm fires", () => {
    const s = setStatus(gameWith(["Alpha"]), "r1", "open");
    expect(() => submit(s, "Alpha", "r1", { stakes: {} }, { now: T0 + 602_000 })).toThrow(/Time is up/);
  });

  test("extra time after the buzzer reopens the round", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = tick(s, T0 + 600_000)!;
    s = act(s, { type: "timer.add", seconds: 60 }, ADMIN, T0 + 610_000);
    expect(s.status.r1).toBe("open");
    expect(s.live.timer.endsAt).toBe(T0 + 670_000);
  });

  test("pause and resume keep the remaining time", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = act(s, { type: "timer.pause" }, ADMIN, T0 + 100_000);
    expect(s.live.timer.pausedLeftMs).toBe(500_000);
    s = act(s, { type: "timer.resume" }, ADMIN, T0 + 200_000);
    expect(s.live.timer.endsAt).toBe(T0 + 700_000);
  });
});

describe("the vault", () => {
  test("opening the round deals one prize per door from the configured counts", () => {
    const s = setStatus(gameWith(["Alpha"]), "r4", "open");
    const dealt = Object.values(s.vault).sort();
    expect(Object.keys(s.vault).sort()).toEqual(s.rounds.r4.doors);
    expect(dealt).toEqual([0, 1, 1, 2, 2, 3]);
  });

  test("doors cannot open before the round locks", () => {
    const s = setStatus(gameWith(["Alpha"]), "r4", "open");
    expect(() => act(s, { type: "vault.open", door: "A" })).toThrow(/Lock the Vault/);
  });
});

describe("registration and teams", () => {
  test("online registration enforces team size and unique names", () => {
    const s = createInitialState(T0);
    const member = { name: "X", srn: "pes1" };
    expect(() => registerTeam(s, { name: "Solo", members: [member] }, T0)).toThrow(/3 to 4 members/);
    const { state, team } = registerTeam(s, { name: "Hive Five", members: [member, member, member] }, T0);
    expect(team.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(team.members[0]!.srn).toBe("PES1");
    expect(() => registerTeam(state, { name: "hive five", members: [member, member, member] }, T0)).toThrow(/taken/);
  });

  test("closed registration is refused", () => {
    let s = createInitialState(T0);
    s = act(s, { type: "event.set", value: { ...s.event, registrationOpen: false } });
    expect(() => registerTeam(s, { name: "Late", members: [] }, T0)).toThrow(/closed/);
  });

  test("removing a team clears its answers and asks to disconnect it", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = submit(s, "Alpha", "r1", { stakes: { l1: 10 } });
    const id = idOf(s, "Alpha");
    const result = applyAction(s, { type: "team.remove", id }, ADMIN, T0);
    expect(result.kickTeams).toEqual([id]);
    expect(result.state.subs.r1[id]).toBeUndefined();
  });

  test("a progress reset keeps teams but clears check-ins and answers", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = submit(s, "Alpha", "r1", { stakes: { l1: 10 } });
    s = act(s, { type: "game.reset", mode: "progress" });
    expect(s.teams).toHaveLength(1);
    expect(s.teams[0]!.checkedIn).toBe(false);
    expect(s.subs.r1).toEqual({});
    expect(s.status.r1).toBe("pending");
  });
});

describe("content edits and backups", () => {
  test("a case whose solution is not among the options is rejected", () => {
    const s = createInitialState(T0);
    expect(() => act(s, { type: "content.set", section: "caseFile", value: { ...s.caseFile, solution: { ...s.caseFile.solution, thiefId: "nobody" } } })).toThrow(/thief/);
  });

  test("image fields only accept uploaded ids or https links", () => {
    const s = createInitialState(T0);
    const items = s.rounds.r3.items.map((item, i) => ({ ...item, image: ["javascript:alert(1)", "https://x.test/a.jpg", "abcdefghij"][i % 3] }));
    const next = act(s, { type: "content.set", section: "r3", value: { ...s.rounds.r3, items } });
    expect(next.rounds.r3.items.slice(0, 3).map((i) => i.image)).toEqual(["", "https://x.test/a.jpg", "abcdefghij"]);
  });

  test("a backup restores to an identical game", () => {
    let s = setStatus(gameWith(["Alpha", "Bravo"]), "r1", "open");
    s = submit(s, "Alpha", "r1", { stakes: { l1: 100 } }, { lock: true });
    const restored = restoreState(JSON.parse(JSON.stringify(s)), s.updatedAt);
    expect(restored).toEqual(s);
  });

  test("anything that is not a backup is refused", () => {
    expect(() => restoreState({ hello: "world" }, T0)).toThrow(/not a Ctrl\+Alt\+Steal backup/);
  });
});

describe("going back and resetting", () => {
  const rewind = (over: Partial<Extract<Action, { type: "show.rewind" }>> = {}): Action => ({
    type: "show.rewind",
    status: {},
    stage: "lobby",
    roundId: null,
    leaderboardHidden: false,
    revealStep: 0,
    label: "test",
    ...over,
  });

  test("going back moves rounds back, keeps every answer and clears the timer", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = submit(s, "Alpha", "r1", { stakes: { l1: 100 } });
    s = setStatus(s, "r1", "revealed");
    s = setStatus(s, "r2", "open");
    s = act(s, rewind({ status: { r1: "locked", r2: "pending" }, stage: "round", roundId: "r1" }));
    expect(s.status).toMatchObject({ r1: "locked", r2: "pending" });
    expect(s.live).toMatchObject({ stage: "round", roundId: "r1" });
    expect(s.live.timer.endsAt).toBeNull();
    expect(s.subs.r1[idOf(s, "Alpha")]!.data.stakes).toEqual({ l1: 100 });
  });

  test("going back to an open round gives it a short countdown, so it still locks by itself", () => {
    let s = setStatus(setStatus(gameWith(["Alpha"]), "r1", "open"), "r1", "locked");
    s = act(s, rewind({ status: { r1: "open" }, stage: "round", roundId: "r1" }));
    expect(s.status.r1).toBe("open");
    expect(s.live.timer.endsAt).toBe(T0 + 120_000);
  });

  test("going back never moves a round forward, so a skipped round can't pay out", () => {
    let s = setStatus(gameWith(["Alpha"]), "r3", "open");
    s = act(s, rewind({ status: { r1: "revealed", r2: "revealed", r3: "intro" }, stage: "round", roundId: "r3" }));
    expect(s.status).toMatchObject({ r1: "pending", r2: "pending", r3: "intro" });
  });

  test("going back before the vault reveal closes the opened doors", () => {
    let s = setStatus(gameWith(["Alpha"]), "r4", "open");
    s = setStatus(s, "r4", "revealed");
    s = act(s, { type: "vault.open", door: s.rounds.r4.doors[0]! });
    s = act(s, rewind({ status: { r4: "locked" }, stage: "round", roundId: "r4" }));
    expect(s.live.vaultOpened).toEqual([]);
  });

  test("going back sets the reveal beat and the leaderboard, and only club heads can do it", () => {
    let s = setStatus(setStatus(gameWith(["Alpha"]), "finale", "open"), "finale", "locked");
    s = act(s, { type: "stage.set", stage: "finalReveal" });
    s = act(s, { type: "live.revealStep", step: 5 });
    expect(() => act(s, rewind(), VOLUNTEER)).toThrow(/not allowed/);
    s = act(s, rewind({ stage: "finalReveal", roundId: "finale", leaderboardHidden: true, revealStep: 1 }));
    expect(s.live).toMatchObject({ stage: "finalReveal", revealStep: 1, leaderboardHidden: true });
    expect(s.status.finale).toBe("revealed");
  });

  test("the reveal screens can't be shown while the finale is unrevealed", () => {
    expect(() => act(gameWith(["Alpha"]), rewind({ stage: "finalReveal", roundId: "finale" }))).toThrow(/finale/);
  });

  test("resetting a round clears its answers and hints and hides it again", () => {
    let s = setStatus(gameWith(["Alpha", "Bravo"]), "r1", "open");
    s = submit(s, "Alpha", "r1", { stakes: { l1: 100 } });
    s = setStatus(s, "r2", "open");
    s = submit(s, "Alpha", "r2", { answers: { q1: "1" } }, { lock: true });
    s = act(s, { type: "hint.buy", roundId: "r2", index: 0 }, teamActor(s, "Bravo"));
    expect(() => act(s, { type: "round.reset", roundId: "r2" }, VOLUNTEER)).toThrow(/not allowed/);
    s = act(s, { type: "round.reset", roundId: "r2" });
    expect(s.status.r2).toBe("pending");
    expect(s.subs.r2).toEqual({});
    expect(s.hints.r2).toEqual({});
    expect(s.live.timer.endsAt).toBeNull();
    expect(s.subs.r1[idOf(s, "Alpha")]).toBeDefined();
  });

  test("resetting the vault closes its doors", () => {
    let s = setStatus(setStatus(gameWith(["Alpha"]), "r4", "open"), "r4", "revealed");
    s = act(s, { type: "vault.open", door: s.rounds.r4.doors[0]! });
    s = act(s, { type: "round.reset", roundId: "r4" });
    expect(s.live.vaultOpened).toEqual([]);
    expect(s.status.r4).toBe("pending");
  });
});
