import { describe, expect, test } from "vitest";
import type { GameState } from "../src/shared/types";
import { computeBadges, computeLedgers, computeStandings } from "../src/server/game/scoring";
import { ADMIN, T0, act, gameWith, idOf, setStatus, submit } from "./helpers";

const credits = (state: GameState, name: string) => computeLedgers(state)[idOf(state, name)]!.total;

describe("Round 1: the Trading Floor", () => {
  test("real leads pay at their odds and rumours lose the stake, only after the reveal", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "open");
    s = submit(s, "Alpha", "r1", { stakes: { l1: 200, l2: 100, l8: 100 } });
    s = setStatus(s, "r1", "locked");
    expect(credits(s, "Alpha")).toBe(1000);
    s = setStatus(s, "r1", "revealed");
    // l1 real ×1.5: +100, l2 fake: −100, l8 real ×4: +300
    expect(credits(s, "Alpha")).toBe(1300);
  });

  test("stakes pushed over the limit by a correction are scaled down", () => {
    let s = setStatus(gameWith(["Alpha"]), "r1", "locked");
    s = act(s, { type: "sub.staffSet", roundId: "r1", teamId: idOf(s, "Alpha"), data: { stakes: { l1: 1200 } }, lock: false });
    s = setStatus(s, "r1", "revealed");
    // capped at maxStake 600 → +300
    expect(credits(s, "Alpha")).toBe(1300);
  });
});

describe("Round 2: the Training Log", () => {
  const right = { answers: { q1: "0.32", q2: "Library", q3: "buzz-kill" } };

  test("hints cost credits immediately and answers pay on reveal", () => {
    let s = setStatus(gameWith(["Alpha"]), "r2", "open");
    s = act(s, { type: "hint.buy", roundId: "r2", index: 0 }, { role: "team", teamId: idOf(s, "Alpha") });
    expect(credits(s, "Alpha")).toBe(925);
    s = submit(s, "Alpha", "r2", { answers: { q1: "0.32", q2: "hostel", q3: "buzzkill" } });
    s = setStatus(s, "r2", "revealed");
    expect(credits(s, "Alpha")).toBe(925 + 100 + 200);
  });

  test("the first teams to lock in all-correct answers get the speed bonus in order", () => {
    let s = setStatus(gameWith(["Alpha", "Bravo", "Charlie"]), "r2", "open");
    s = submit(s, "Bravo", "r2", right, { lock: true, now: T0 + 1000 });
    s = submit(s, "Alpha", "r2", right, { lock: true, now: T0 + 2000 });
    s = submit(s, "Charlie", "r2", right, { lock: false, now: T0 + 500 });
    s = setStatus(s, "r2", "revealed");
    expect(credits(s, "Bravo")).toBe(1000 + 450 + 150);
    expect(credits(s, "Alpha")).toBe(1000 + 450 + 100);
    // Never locked in early, so no speed bonus.
    expect(credits(s, "Charlie")).toBe(1000 + 450);
  });
});

describe("Round 3: the Lineup", () => {
  test("correct calls earn, wrong calls cost, blanks are free", () => {
    let s = setStatus(gameWith(["Alpha"]), "r3", "open");
    s = submit(s, "Alpha", "r3", { calls: { e1: "real", e5: "fake", e6: "real" } });
    s = setStatus(s, "r3", "revealed");
    expect(credits(s, "Alpha")).toBe(1000 + 2 * 80 - 40);
  });
});

describe("Round 4: the Vault", () => {
  function vaultGame() {
    let s = setStatus(gameWith(["Alpha", "Bravo"]), "r4", "open");
    s = act(s, { type: "vault.assign", door: "A", prizeIndex: 0 }); // jackpot ×3
    s = act(s, { type: "vault.assign", door: "B", prizeIndex: 3 }); // alarm ×0
    s = submit(s, "Alpha", "r4", { choice: "vault", door: "A", wager: 500 });
    s = submit(s, "Bravo", "r4", { choice: "bank", door: "", wager: 0 });
    return setStatus(s, "r4", "locked");
  }

  test("payouts only land once the team's door opens", () => {
    let s = vaultGame();
    s = act(s, { type: "vault.open", door: "B" });
    expect(credits(s, "Alpha")).toBe(1000);
    expect(computeLedgers(s)[idOf(s, "Alpha")]!.rows.at(-1)!.pending).toBe(true);
    s = act(s, { type: "vault.open", door: "A" });
    expect(credits(s, "Alpha")).toBe(2000);
    expect(credits(s, "Bravo")).toBe(1000);
  });

  test("wagers above half the credits are rejected", () => {
    const s = setStatus(gameWith(["Alpha"]), "r4", "open");
    expect(() => submit(s, "Alpha", "r4", { choice: "vault", door: "A", wager: 501 })).toThrow(/at most 500/);
    expect(() => submit(s, "Alpha", "r4", { choice: "vault", door: "A", wager: 50 })).toThrow(/minimum/);
  });
});

describe("the finale", () => {
  function finaleGame(answer: { thiefId: string; locationId: string; methodId: string }, bet: number) {
    let s = setStatus(gameWith(["Alpha"]), "finale", "open");
    s = submit(s, "Alpha", "finale", { ...answer, bet });
    s = act(s, { type: "stage.set", stage: "finalReveal" });
    return s;
  }
  const truth = { thiefId: "overfit", locationId: "library", methodId: "decrypt" };

  test("nothing changes until the method is revealed", () => {
    let s = finaleGame(truth, 400);
    s = act(s, { type: "live.revealStep", step: 2 });
    expect(credits(s, "Alpha")).toBe(1000);
    s = act(s, { type: "live.revealStep", step: 3 });
    expect(credits(s, "Alpha")).toBe(1800);
  });

  test("two out of three returns the bet; one or none loses it", () => {
    let two = finaleGame({ ...truth, methodId: "revoke" }, 400);
    two = act(two, { type: "live.revealStep", step: 3 });
    expect(credits(two, "Alpha")).toBe(1000);
    let one = finaleGame({ thiefId: "root", locationId: "hostel", methodId: "decrypt" }, 400);
    one = act(one, { type: "live.revealStep", step: 3 });
    expect(credits(one, "Alpha")).toBe(600);
  });

  test("a bet larger than the team's credits cannot be placed", () => {
    const s = setStatus(gameWith(["Alpha"]), "finale", "open");
    expect(() => submit(s, "Alpha", "finale", { ...truth, bet: 1001 })).toThrow(/only have 1000/);
  });
});

describe("adjustments and standings", () => {
  test("an adjustment counts toward the budget of the rounds after it", () => {
    let s = gameWith(["Alpha"]);
    s = act(s, { type: "adj.add", teamId: idOf(s, "Alpha"), amount: 1000, reason: "Prize from host", afterRound: null });
    s = setStatus(s, "finale", "open");
    s = submit(s, "Alpha", "finale", { thiefId: "overfit", locationId: "library", methodId: "decrypt", bet: 2000 });
    s = act(s, { type: "stage.set", stage: "finalReveal" });
    s = act(s, { type: "live.revealStep", step: 3 });
    expect(credits(s, "Alpha")).toBe(6000);
  });

  test("ties share a rank and rank changes are tracked", () => {
    let s = setStatus(gameWith(["Alpha", "Bravo", "Charlie"]), "r1", "open");
    s = submit(s, "Charlie", "r1", { stakes: { l8: 100 } });
    s = submit(s, "Alpha", "r1", { stakes: { l2: 100 } });
    s = setStatus(s, "r1", "revealed");
    const standings = computeStandings(s, computeLedgers(s));
    expect(standings.map((x) => [x.teamId, x.rank, x.prevRank])).toEqual([
      [idOf(s, "Charlie"), 1, 1],
      [idOf(s, "Bravo"), 2, 1],
      [idOf(s, "Alpha"), 3, 1],
    ]);
  });

  test("disqualified and absent teams drop off the leaderboard", () => {
    let s = gameWith(["Alpha", "Bravo"]);
    s = act(s, { type: "team.dq", id: idOf(s, "Alpha"), value: true });
    s = act(s, { type: "team.checkin", id: idOf(s, "Bravo"), value: false }, ADMIN);
    expect(computeStandings(s, computeLedgers(s))).toEqual([]);
  });

  test("a perfect Lineup earns the Deepfake Hunter badge", () => {
    let s = setStatus(gameWith(["Alpha"]), "r3", "open");
    const calls = Object.fromEntries(s.rounds.r3.items.map((i) => [i.id, i.fake ? "fake" : "real"]));
    s = submit(s, "Alpha", "r3", { calls });
    s = setStatus(s, "r3", "revealed");
    const badges = computeBadges(s, computeLedgers(s))[idOf(s, "Alpha")]!;
    expect(badges.map((b) => b.id)).toContain("hunter");
  });
});
