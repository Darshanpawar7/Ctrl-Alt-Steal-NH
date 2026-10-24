import { describe, expect, test } from "vitest";
import type { Action } from "../src/shared/protocol";
import type { GameState } from "../src/shared/types";
import { STEPS, backActions, goToActions, nextStepIndex } from "../src/client/pages/admin/runOfShow";
import { act, gameWith, idOf, submit } from "./helpers";

const play = (state: GameState, actions: Action[]) => actions.reduce((s, action) => act(s, action), state);
const indexOf = (id: string) => STEPS.findIndex((step) => step.id === id);
/** What the Control room shows as "Up next" once `index` is the latest step run. */
const upNextAfter = (index: number) => (index + 1 < STEPS.length ? index + 1 : -1);

/** The game after pressing Next `presses` times from a fresh start (check-in is open from the start). */
function pressNext(presses: number, state = gameWith(["Alpha", "Bravo"])): GameState {
  let s = state;
  for (let i = 0; i < presses; i++) s = play(s, STEPS[nextStepIndex(s)]!.actions);
  return s;
}

describe("run of show", () => {
  test("pressing Next walks through every step in order", () => {
    let s = gameWith(["Alpha"]);
    for (let i = 1; i < STEPS.length; i++) {
      expect(nextStepIndex(s)).toBe(i);
      s = play(s, STEPS[i]!.actions);
    }
    expect(nextStepIndex(s)).toBe(-1);
  });

  test("going back to any earlier step leaves the game right at that step", () => {
    for (let position = 1; position < STEPS.length; position++) {
      const s = pressNext(position);
      for (let target = 0; target <= position; target++) {
        const after = play(s, goToActions(target));
        expect(nextStepIndex(after), `from "${STEPS[position]!.title}" back to "${STEPS[target]!.title}"`).toBe(upNextAfter(target));
      }
    }
  });

  test("Back undoes exactly one step, and there is nothing before check-in", () => {
    expect(backActions(pressNext(0))).toBeNull();
    for (let position = 1; position < STEPS.length; position++) {
      const s = pressNext(position);
      const after = play(s, backActions(s)!);
      expect(nextStepIndex(after), `Back from "${STEPS[position]!.title}"`).toBe(position);
    }
  });

  test("Back from the leaderboard blackout leaves the vault doors open", () => {
    let s = pressNext(indexOf("r4-reveal"));
    s = act(s, { type: "vault.open", door: s.rounds.r4.doors[0]! });
    s = pressNext(1, s);
    expect(STEPS[nextStepIndex(s) - 1]!.id).toBe("blackout");
    s = play(s, backActions(s)!);
    expect(s.live.vaultOpened).toHaveLength(1);
    expect(s.live.leaderboardHidden).toBe(false);
  });

  test("going back keeps the crews' answers", () => {
    let s = pressNext(indexOf("r1-open"));
    s = submit(s, "Alpha", "r1", { stakes: { l1: 100 } });
    s = pressNext(indexOf("r2-intro") - indexOf("r1-open"), s);
    s = play(s, goToActions(indexOf("lobby")));
    expect(s.live.stage).toBe("lobby");
    expect(s.status.r1).toBe("pending");
    expect(s.subs.r1[idOf(s, "Alpha")]!.data.stakes).toEqual({ l1: 100 });
  });
});
