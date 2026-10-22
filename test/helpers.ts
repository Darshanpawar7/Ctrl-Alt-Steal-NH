import type { Action } from "../src/shared/protocol";
import type { GameState, RoundId, RoundStatus } from "../src/shared/types";
import { applyAction, type Actor } from "../src/server/game/actions";
import { createInitialState } from "../src/server/game/state";

export const T0 = 1_700_000_000_000;
export const ADMIN: Actor = { role: "admin", teamId: null };
export const VOLUNTEER: Actor = { role: "volunteer", teamId: null };

export function teamActor(state: GameState, name: string): Actor {
  const team = state.teams.find((t) => t.name === name);
  if (!team) throw new Error(`no team ${name}`);
  return { role: "team", teamId: team.id };
}

export function idOf(state: GameState, name: string): string {
  return teamActor(state, name).teamId!;
}

export function act(state: GameState, action: Action, actor: Actor = ADMIN, now = T0): GameState {
  return applyAction(state, action, actor, now).state;
}

/** A fresh game with the given teams registered and checked in. */
export function gameWith(names: string[]): GameState {
  let state = createInitialState(T0);
  for (const name of names) {
    state = act(state, { type: "team.add", team: { name, emoji: "🐝", members: [{ name: "A", srn: "" }], contact: "" }, checkIn: true });
  }
  return state;
}

export function setStatus(state: GameState, roundId: RoundId, status: RoundStatus, now = T0): GameState {
  return act(state, { type: "round.set", roundId, status }, ADMIN, now);
}

/** Saves a submission as the team while the round is open. */
export function submit(state: GameState, name: string, roundId: RoundId, data: unknown, opts: { lock?: boolean; now?: number } = {}): GameState {
  return act(state, { type: "sub.save", roundId, data, lock: opts.lock }, teamActor(state, name), opts.now ?? T0);
}
