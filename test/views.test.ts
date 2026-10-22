import { describe, expect, test } from "vitest";
import type { GameState } from "../src/shared/types";
import { buildContext, publicView, staffView, teamView } from "../src/worker/game/views";
import { act, gameWith, idOf, setStatus, submit } from "./helpers";

const presence = { screens: 0, staff: 0, teams: {} };
const json = (value: unknown) => JSON.stringify(value).toLowerCase();

/** Every round is showing its content, but nothing has been revealed. */
function midGame(): GameState {
  let s = gameWith(["Alpha", "Bravo"]);
  for (const id of ["r1", "r2", "r3", "finale"] as const) s = setStatus(s, id, "intro");
  s = setStatus(s, "r4", "open");
  return setStatus(s, "r4", "locked");
}

describe("answer keys stay secret until the reveal", () => {
  test("the public and team views contain no answers", () => {
    const s = midGame();
    const ctx = buildContext(s, presence);
    for (const view of [publicView(s, ctx), teamView(s, ctx, idOf(s, "Alpha"))]) {
      const text = json(view);
      expect(text).not.toContain("buzzkill");
      expect(text).not.toContain('"real":true');
      expect(text).not.toContain('"fake":true');
      expect(text).not.toContain('"tell":');
      expect(text).not.toContain('"answers":');
      expect(view?.caseFile.solution).toEqual({ thiefId: undefined, locationId: undefined, methodId: undefined });
      expect(view?.rounds.r4.opened).toEqual({});
    }
  });

  test("volunteers see teams and answers but not the keys", () => {
    const s = midGame();
    const view = staffView(s, buildContext(s, presence), "volunteer");
    expect(view.full).toBeNull();
    expect(view.staff.audit).toEqual([]);
    expect(json(view)).not.toContain("buzzkill");
  });

  test("a revealed round exposes its own key and clue, and nothing else", () => {
    let s = midGame();
    s = setStatus(s, "r1", "revealed");
    const view = publicView(s, buildContext(s, presence));
    expect(view.rounds.r1.leads!.filter((l) => l.real)).toHaveLength(4);
    expect(view.caseFile.clues.r1).toBeDefined();
    expect(view.caseFile.clues.r2).toBeUndefined();
    expect(json(view.rounds.r3)).not.toContain('"fake":true');
  });

  test("the final reveal shows the solution one part at a time", () => {
    let s = midGame();
    s = act(s, { type: "stage.set", stage: "finalReveal" });
    s = act(s, { type: "live.revealStep", step: 1 });
    const view = publicView(s, buildContext(s, presence));
    expect(view.caseFile.solution).toEqual({ thiefId: "overfit", locationId: undefined, methodId: undefined });
  });
});

describe("team privacy", () => {
  test("a team sees its own code and answers but never another team's", () => {
    let s = setStatus(gameWith(["Alpha", "Bravo"]), "r1", "open");
    s = submit(s, "Bravo", "r1", { stakes: { l3: 123 } });
    const ctx = buildContext(s, presence);
    const alpha = teamView(s, ctx, idOf(s, "Alpha"))!;
    const bravo = s.teams.find((t) => t.name === "Bravo")!;
    expect(alpha.me.team.code).toBe(s.teams.find((t) => t.name === "Alpha")!.code);
    expect(json(alpha)).not.toContain(bravo.code.toLowerCase());
    expect(json(alpha)).not.toContain("123");
  });

  test("a blacked-out leaderboard hides ranks but not a team's own credits", () => {
    let s = gameWith(["Alpha"]);
    s = act(s, { type: "live.leaderboard", hidden: true });
    const ctx = buildContext(s, presence);
    expect(publicView(s, ctx).standings).toBeNull();
    const me = teamView(s, ctx, idOf(s, "Alpha"))!.me;
    expect(me.credits).toBe(1000);
    expect(me.rank).toBeNull();
  });

  test("the bonus clue reaches only teams whose winning door has opened", () => {
    let s = setStatus(gameWith(["Alpha", "Bravo"]), "r4", "open");
    s = act(s, { type: "vault.assign", door: "A", prizeIndex: 1 });
    s = act(s, { type: "vault.assign", door: "B", prizeIndex: 2 });
    s = submit(s, "Alpha", "r4", { choice: "vault", door: "A", wager: 200 });
    s = submit(s, "Bravo", "r4", { choice: "vault", door: "B", wager: 200 });
    s = setStatus(s, "r4", "locked");
    let ctx = buildContext(s, presence);
    expect(teamView(s, ctx, idOf(s, "Alpha"))!.me.bonusClue).toBeNull();
    s = act(s, { type: "vault.open", door: "A" });
    s = act(s, { type: "vault.open", door: "B" });
    ctx = buildContext(s, presence);
    expect(teamView(s, ctx, idOf(s, "Alpha"))!.me.bonusClue?.title).toContain("Bonus");
    expect(teamView(s, ctx, idOf(s, "Bravo"))!.me.bonusClue).toBeNull();
    expect(json(publicView(s, ctx))).not.toContain("first-year student");
  });
});
