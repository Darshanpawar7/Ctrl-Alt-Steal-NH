// Every change to the game goes through applyAction. It never mutates the
// state it is given: it works on a deep copy and returns the new state.

import type { Action, ActionType, TeamInput } from "../../shared/protocol";
import {
  REVEAL_STEPS,
  ROUND_IDS,
  type GameState,
  type Role,
  type RoundId,
  type RoundStatus,
  type Stage,
  type SubData,
  type Team,
} from "../../shared/types";
import {
  ROUND_SANITIZERS,
  checkCase,
  int,
  isRoundId,
  sanitizeCase,
  sanitizeEvent,
  sanitizeMark,
  sanitizeSub,
  sanitizeTeamInput,
  str,
} from "./sanitize";
import { computeLedgers, vaultCap } from "./scoring";
import { createInitialState, emptyHints, emptySubs, emptyTimer, initialLive, pendingStatus, pushAudit, pushFeed, timerRunning } from "./state";
import { newId, newTeamCode, shuffle, sum } from "./util";

export class GameError extends Error {}

export interface Actor {
  role: Role;
  teamId: string | null;
}

export interface ActionResult {
  state: GameState;
  /** Teams whose open connections must be closed (code changed or team removed). */
  kickTeams: string[];
}

const TEAM_ACTIONS = new Set<ActionType>(["sub.save", "hint.buy", "board.mark", "board.notes"]);
const VOLUNTEER_ACTIONS = new Set<ActionType>(["team.add", "team.update", "team.checkin", "sub.staffSet"]);
const STAGES: Stage[] = ["lobby", "briefing", "round", "leaderboard", "break", "consolidation", "finalReveal", "podium"];
const STATUSES: RoundStatus[] = ["pending", "intro", "open", "locked", "revealed"];
/** Teams may keep saving for a moment after the buzzer to absorb network lag. */
const SUBMIT_GRACE_MS = 1500;
const DEMO_TEAMS: [string, string][] = [
  ["Byte Bandits", "🦝"], ["Gradient Ghosts", "👻"], ["The Overfitters", "🧩"], ["Null Pointers", "🎯"],
  ["Kernel Panic", "🌽"], ["Tensor Thieves", "🦊"], ["Loss Leaders", "📉"], ["Prompt Injectors", "💉"],
  ["Random Forest Gump", "🌲"], ["Backprop Bandits", "🔁"], ["Sudo Sleuths", "🕵️"], ["Cache Me If You Can", "🏃"],
  ["Epoch Eagles", "🦅"], ["Ctrl+Z Squad", "↩️"], ["Deep Fakers", "🎭"], ["Batch Normies", "🧃"],
];

export function canPerform(role: Role, type: ActionType): boolean {
  if (role === "admin") return true;
  if (role === "volunteer") return VOLUNTEER_ACTIONS.has(type);
  if (role === "team") return TEAM_ACTIONS.has(type);
  return false;
}

export function applyAction(prev: GameState, action: Action, actor: Actor, now: number): ActionResult {
  if (!canPerform(actor.role, action.type)) throw new GameError("You are not allowed to do that.");
  const state = structuredClone(prev);
  const kickTeams: string[] = [];
  handle(state, action, actor, now, kickTeams);
  state.updatedAt = now;
  return { state, kickTeams };
}

// ---------------------------------------------------------------- helpers

function team(state: GameState, id: string | null): Team {
  const found = state.teams.find((t) => t.id === id);
  if (!found) throw new GameError("That team does not exist.");
  return found;
}

function round(id: unknown): RoundId {
  if (!isRoundId(id)) throw new GameError("Unknown round.");
  return id;
}

function audit(state: GameState, now: number, actor: Actor, type: string, summary: string): void {
  pushAudit(state, now, actor.role, type, summary);
}

function checkTeamInput(state: GameState, input: TeamInput, exceptId: string | null, isStaff: boolean): void {
  if (input.name.length < 2) throw new GameError("Team name needs at least 2 characters.");
  const clash = state.teams.find((t) => t.id !== exceptId && t.name.toLowerCase() === input.name.toLowerCase());
  if (clash) throw new GameError("That team name is taken. Try another.");
  const { minMembers, maxMembers } = state.event;
  const min = isStaff ? 1 : minMembers;
  if (input.members.length < min || input.members.length > maxMembers) {
    throw new GameError(`A crew needs ${min === maxMembers ? min : `${min} to ${maxMembers}`} members.`);
  }
}

export function createTeam(state: GameState, input: TeamInput, source: Team["source"], now: number): Team {
  const created: Team = {
    id: newId(),
    code: newTeamCode(new Set(state.teams.map((t) => t.code))),
    name: input.name,
    emoji: input.emoji,
    members: input.members,
    contact: input.contact,
    checkedIn: false,
    checkedInAt: null,
    disqualified: false,
    notes: input.notes ?? "",
    createdAt: now,
    source,
  };
  state.teams.push(created);
  return created;
}

/** Registration from the public website. Returns the new team. */
export function registerTeam(prev: GameState, raw: unknown, now: number): { state: GameState; team: Team } {
  if (!prev.event.registrationOpen) throw new GameError("Registration is closed.");
  if (prev.teams.length >= prev.event.maxTeams) throw new GameError("All team slots are full. Talk to the organisers.");
  const input = sanitizeTeamInput(raw);
  const state = structuredClone(prev);
  checkTeamInput(state, input, null, false);
  const created = createTeam(state, { ...input, notes: "" }, "online", now);
  pushAudit(state, now, "team", "team.register", `${created.name} registered online`);
  state.updatedAt = now;
  return { state, team: created };
}

function roundCanAcceptTeam(state: GameState, roundId: RoundId, now: number): void {
  if (state.status[roundId] !== "open") throw new GameError("This round is not open right now.");
  const { timer } = state.live;
  if (timerRunning(timer) && timer.endsAt! + SUBMIT_GRACE_MS < now) throw new GameError("Time is up for this round.");
}

/** Keeps only known ids and enforces each round's betting limits. */
function cleanSub<K extends RoundId>(state: GameState, roundId: K, raw: unknown, budget: number, enforceLimits: boolean): SubData[K] {
  const data = sanitizeSub(roundId, raw);
  const pick = <T>(record: Record<string, T>, ids: string[]) =>
    Object.fromEntries(Object.entries(record).filter(([key]) => ids.includes(key))) as Record<string, T>;

  if (roundId === "r1") {
    const d = data as SubData["r1"];
    const stakes = pick(d.stakes, state.rounds.r1.leads.map((l) => l.id));
    const limit = Math.min(state.rounds.r1.maxStake, budget);
    if (enforceLimits && sum(Object.values(stakes)) > limit) throw new GameError(`You can stake at most ${limit} credits in total.`);
    return { stakes } as SubData[K];
  }
  if (roundId === "r2") {
    const d = data as SubData["r2"];
    return { answers: pick(d.answers, state.rounds.r2.questions.map((q) => q.id)) } as SubData[K];
  }
  if (roundId === "r3") {
    const d = data as SubData["r3"];
    return { calls: pick(d.calls, state.rounds.r3.items.map((i) => i.id)) } as SubData[K];
  }
  if (roundId === "r4") {
    const d = data as SubData["r4"];
    const cfg = state.rounds.r4;
    if (d.door && !cfg.doors.includes(d.door)) throw new GameError("That door does not exist.");
    if (enforceLimits && d.choice === "vault" && d.wager > 0) {
      const cap = vaultCap(state, budget);
      if (d.wager > cap) throw new GameError(`You can wager at most ${cap} credits.`);
      if (d.wager < cfg.minWager) throw new GameError(`The minimum wager is ${cfg.minWager} credits.`);
    }
    return { ...d, wager: d.choice === "bank" ? 0 : d.wager } as SubData[K];
  }
  const d = data as SubData["finale"];
  const { suspects, locations, methods } = state.caseFile;
  const known = (id: string, options: { id: string }[]) => (options.some((o) => o.id === id) ? id : "");
  if (enforceLimits && d.bet > budget) throw new GameError(`You only have ${budget} credits to bet.`);
  return {
    thiefId: known(d.thiefId, suspects),
    locationId: known(d.locationId, locations),
    methodId: known(d.methodId, methods),
    bet: d.bet,
  } as SubData[K];
}

function setSub<K extends RoundId>(state: GameState, roundId: K, teamId: string, data: SubData[K], lockedAt: number | null, by: Role, now: number): void {
  (state.subs[roundId] as Record<string, unknown>)[teamId] = { data, savedAt: now, lockedAt, by };
}

function shuffleVault(state: GameState): void {
  const { doors, prizes } = state.rounds.r4;
  const pool: number[] = [];
  prizes.forEach((prize, index) => {
    for (let i = 0; i < prize.count; i++) pool.push(index);
  });
  // If counts and doors disagree, cycle through the prizes so every door has one.
  for (let i = 0; pool.length < doors.length && prizes.length; i++) pool.push(i % prizes.length);
  const dealt = shuffle(pool).slice(0, doors.length);
  state.vault = Object.fromEntries(doors.map((door, i) => [door, dealt[i] ?? 0]));
}

function startTimer(state: GameState, seconds: number, label: string, now: number): void {
  const ms = Math.round(seconds * 1000);
  state.live.timer = { label, durationMs: ms, endsAt: now + ms, pausedLeftMs: null };
}

// ---------------------------------------------------------------- handlers

function handle(state: GameState, action: Action, actor: Actor, now: number, kickTeams: string[]): void {
  const ledgerOf = (teamId: string) => computeLedgers(state)[teamId]!;

  switch (action.type) {
    // ------------------------------------------------------------ team
    case "sub.save": {
      const me = team(state, actor.teamId);
      const roundId = round(action.roundId);
      if (me.disqualified) throw new GameError("Your team has been disqualified.");
      if (state.event.requireCheckIn && !me.checkedIn) throw new GameError("Check in at the registration desk first.");
      roundCanAcceptTeam(state, roundId, now);
      const existing = state.subs[roundId][me.id];
      if (existing?.lockedAt) throw new GameError("You already locked in this round.");
      const data = cleanSub(state, roundId, action.data, ledgerOf(me.id).before[roundId], true);
      setSub(state, roundId, me.id, data, action.lock ? now : null, "team", now);
      if (action.lock) pushFeed(state, now, "🔒", `${me.emoji} ${me.name} locked in.`, "hype");
      return;
    }
    case "hint.buy": {
      const me = team(state, actor.teamId);
      const roundId = round(action.roundId);
      if (state.event.requireCheckIn && !me.checkedIn) throw new GameError("Check in at the registration desk first.");
      roundCanAcceptTeam(state, roundId, now);
      const hint = state.rounds[roundId].hints[action.index];
      if (!hint) throw new GameError("That hint does not exist.");
      const bought = state.hints[roundId][me.id] ?? [];
      if (bought.includes(action.index)) return;
      if (hint.cost > ledgerOf(me.id).total) throw new GameError("Not enough credits for that hint.");
      state.hints[roundId][me.id] = [...bought, action.index];
      pushFeed(state, now, "💡", `${me.emoji} ${me.name} bought a hint.`, "info");
      return;
    }
    case "board.mark": {
      const me = team(state, actor.teamId);
      const key = str(action.key, 50);
      const [kind, id] = key.split(":");
      const { suspects, locations, methods } = state.caseFile;
      const options = kind === "s" ? suspects : kind === "l" ? locations : kind === "m" ? methods : [];
      if (!options.some((o) => o.id === id)) throw new GameError("Unknown board entry.");
      const board = state.boards[me.id] ?? { marks: {}, notes: "" };
      const mark = sanitizeMark(action.mark);
      const marks = { ...board.marks };
      if (mark === "none") delete marks[key];
      else marks[key] = mark;
      state.boards[me.id] = { ...board, marks };
      return;
    }
    case "board.notes": {
      const me = team(state, actor.teamId);
      const board = state.boards[me.id] ?? { marks: {}, notes: "" };
      state.boards[me.id] = { ...board, notes: str(action.notes, 2000) };
      return;
    }

    // ------------------------------------------------------------ staff
    case "team.add": {
      const input = sanitizeTeamInput(action.team);
      checkTeamInput(state, input, null, true);
      const created = createTeam(state, input, "desk", now);
      if (action.checkIn) {
        created.checkedIn = true;
        created.checkedInAt = now;
        pushFeed(state, now, "✅", `${created.emoji} ${created.name} checked in.`, "good");
      }
      audit(state, now, actor, action.type, `Added team ${created.name}`);
      return;
    }
    case "team.update": {
      const target = team(state, action.id);
      const input = sanitizeTeamInput(action.team);
      checkTeamInput(state, input, target.id, true);
      Object.assign(target, { name: input.name, emoji: input.emoji, members: input.members, contact: input.contact, notes: input.notes ?? target.notes });
      audit(state, now, actor, action.type, `Edited team ${target.name}`);
      return;
    }
    case "team.checkin": {
      const target = team(state, action.id);
      if (target.checkedIn === Boolean(action.value)) return;
      target.checkedIn = Boolean(action.value);
      target.checkedInAt = target.checkedIn ? now : null;
      if (target.checkedIn) pushFeed(state, now, "✅", `${target.emoji} ${target.name} checked in.`, "good");
      audit(state, now, actor, action.type, `${target.checkedIn ? "Checked in" : "Undid check-in for"} ${target.name}`);
      return;
    }
    case "sub.staffSet": {
      const target = team(state, action.teamId);
      const roundId = round(action.roundId);
      if (actor.role === "volunteer" && state.status[roundId] === "revealed") {
        throw new GameError("This round is already revealed. Ask an admin to correct it.");
      }
      const ledger = ledgerOf(target.id);
      const data = cleanSub(state, roundId, action.data, ledger.before[roundId], false);
      const existing = state.subs[roundId][target.id];
      const lockedAt = action.lock ? (existing?.lockedAt ?? now) : null;
      setSub(state, roundId, target.id, data, lockedAt, actor.role, now);
      audit(state, now, actor, action.type, `Entered ${state.rounds[roundId].codename} answer for ${target.name}`);
      return;
    }

    // ------------------------------------------------------------ admin: teams
    case "team.remove": {
      const target = team(state, action.id);
      state.teams = state.teams.filter((t) => t.id !== target.id);
      for (const roundId of ROUND_IDS) {
        delete state.subs[roundId][target.id];
        delete state.hints[roundId][target.id];
      }
      delete state.boards[target.id];
      state.adjustments = state.adjustments.filter((a) => a.teamId !== target.id);
      kickTeams.push(target.id);
      audit(state, now, actor, action.type, `Removed team ${target.name}`);
      return;
    }
    case "team.dq": {
      const target = team(state, action.id);
      target.disqualified = Boolean(action.value);
      audit(state, now, actor, action.type, `${target.disqualified ? "Disqualified" : "Reinstated"} ${target.name}`);
      return;
    }
    case "team.newCode": {
      const target = team(state, action.id);
      target.code = newTeamCode(new Set(state.teams.map((t) => t.code)));
      kickTeams.push(target.id);
      audit(state, now, actor, action.type, `Issued a new code to ${target.name}`);
      return;
    }

    // ------------------------------------------------------------ admin: submissions
    case "sub.clear": {
      const target = team(state, action.teamId);
      const roundId = round(action.roundId);
      delete state.subs[roundId][target.id];
      audit(state, now, actor, action.type, `Cleared ${state.rounds[roundId].codename} answer for ${target.name}`);
      return;
    }
    case "sub.unlock": {
      const target = team(state, action.teamId);
      const roundId = round(action.roundId);
      const sub = state.subs[roundId][target.id];
      if (sub) sub.lockedAt = null;
      audit(state, now, actor, action.type, `Unlocked ${state.rounds[roundId].codename} answer for ${target.name}`);
      return;
    }
    case "hint.set": {
      const target = team(state, action.teamId);
      const roundId = round(action.roundId);
      const count = state.rounds[roundId].hints.length;
      const indexes = [...new Set((Array.isArray(action.indexes) ? action.indexes : []).map((i) => int(i, 0, 99, -1)))].filter((i) => i >= 0 && i < count);
      state.hints[roundId][target.id] = indexes;
      audit(state, now, actor, action.type, `Set ${state.rounds[roundId].codename} hints for ${target.name} to [${indexes.map((i) => i + 1).join(", ")}]`);
      return;
    }

    // ------------------------------------------------------------ admin: flow
    case "stage.set": {
      if (!STAGES.includes(action.stage)) throw new GameError("Unknown stage.");
      state.live.stage = action.stage;
      if (action.roundId !== undefined) state.live.roundId = action.roundId === null ? null : round(action.roundId);
      if (action.stage === "finalReveal") {
        // Entering the reveal locks the final answers for good.
        if (state.status.finale !== "revealed") state.status.finale = "revealed";
        state.live.roundId = "finale";
        state.live.timer = emptyTimer();
        state.live.leaderboardHidden = true;
      }
      audit(state, now, actor, action.type, `Screen → ${action.stage}`);
      return;
    }
    case "round.set": {
      const roundId = round(action.roundId);
      if (!STATUSES.includes(action.status)) throw new GameError("Unknown round status.");
      const cfg = state.rounds[roundId];
      state.status[roundId] = action.status;
      if (action.status !== "pending") {
        state.live.stage = "round";
        state.live.roundId = roundId;
      }
      if (action.status === "intro") state.live.timer = emptyTimer();
      if (action.status === "open") {
        for (const other of ROUND_IDS) if (other !== roundId && state.status[other] === "open") state.status[other] = "locked";
        if (roundId === "r4" && Object.keys(state.vault).length === 0) shuffleVault(state);
        startTimer(state, cfg.durationSec, `${cfg.codename} · ${cfg.title}`, now);
        pushFeed(state, now, "🚨", `${cfg.codename} is LIVE: ${cfg.title}.`, "hype");
      }
      if (action.status === "locked") {
        state.live.timer = emptyTimer();
        pushFeed(state, now, "🔒", `${cfg.codename} is locked. No more changes.`, "info");
      }
      if (action.status === "revealed") {
        state.live.timer = emptyTimer();
        if (roundId === "r1" || roundId === "r2" || roundId === "r3") {
          pushFeed(state, now, "🧩", `${state.caseFile.clues[roundId].title} unlocked.`, "good");
        }
      }
      audit(state, now, actor, action.type, `${cfg.codename} → ${action.status}`);
      return;
    }
    case "timer.start": {
      const seconds = int(action.seconds, 1, 6 * 3600, 60);
      startTimer(state, seconds, str(action.label, 120), now);
      audit(state, now, actor, action.type, `Started a ${seconds}s timer`);
      return;
    }
    case "timer.pause": {
      const { timer } = state.live;
      if (!timerRunning(timer)) return;
      state.live.timer = { ...timer, pausedLeftMs: Math.max(0, timer.endsAt! - now), endsAt: null };
      audit(state, now, actor, action.type, "Paused the timer");
      return;
    }
    case "timer.resume": {
      const { timer } = state.live;
      if (timer.pausedLeftMs === null) return;
      state.live.timer = { ...timer, endsAt: now + timer.pausedLeftMs, pausedLeftMs: null };
      audit(state, now, actor, action.type, "Resumed the timer");
      return;
    }
    case "timer.add": {
      const ms = int(action.seconds, -3600, 3600, 0) * 1000;
      const { timer } = state.live;
      if (timer.pausedLeftMs !== null) {
        state.live.timer = { ...timer, pausedLeftMs: Math.max(0, timer.pausedLeftMs + ms), durationMs: Math.max(0, timer.durationMs + ms) };
      } else if (timer.endsAt !== null && timer.endsAt > now) {
        state.live.timer = { ...timer, endsAt: Math.max(now, timer.endsAt + ms), durationMs: Math.max(0, timer.durationMs + ms) };
      } else if (ms > 0) {
        // Time already ran out: give extra time and reopen the round it locked.
        state.live.timer = { label: timer.label, durationMs: ms, endsAt: now + ms, pausedLeftMs: null };
        const roundId = state.live.roundId;
        if (state.live.stage === "round" && roundId && state.status[roundId] === "locked") state.status[roundId] = "open";
        pushFeed(state, now, "⏱️", `Extra time! +${Math.round(ms / 1000)}s`, "hype");
      }
      audit(state, now, actor, action.type, `Timer ${ms >= 0 ? "+" : ""}${ms / 1000}s`);
      return;
    }
    case "timer.clear":
      state.live.timer = emptyTimer();
      audit(state, now, actor, action.type, "Cleared the timer");
      return;
    case "live.leaderboard":
      state.live.leaderboardHidden = Boolean(action.hidden);
      audit(state, now, actor, action.type, action.hidden ? "Leaderboard blacked out" : "Leaderboard visible");
      return;
    case "live.revealStep": {
      state.live.revealStep = int(action.step, 0, REVEAL_STEPS.length - 1, 0);
      if (state.live.revealStep >= REVEAL_STEPS.indexOf("standings")) state.live.leaderboardHidden = false;
      audit(state, now, actor, action.type, `Final reveal → ${REVEAL_STEPS[state.live.revealStep]}`);
      return;
    }
    case "announce": {
      const text = str(action.text, 280).trim();
      state.live.announcement = text ? { id: newId(), text, at: now } : null;
      if (text) pushFeed(state, now, "📣", text, "hype");
      audit(state, now, actor, action.type, text ? `Announced: ${text}` : "Cleared the announcement");
      return;
    }

    // ------------------------------------------------------------ admin: vault
    case "vault.open": {
      const door = str(action.door, 4);
      if (!state.rounds.r4.doors.includes(door)) throw new GameError("That door does not exist.");
      if (state.status.r4 !== "locked" && state.status.r4 !== "revealed") throw new GameError("Lock the Vault round before opening doors.");
      if (Object.keys(state.vault).length === 0) shuffleVault(state);
      state.status.r4 = "revealed";
      state.live.stage = "round";
      state.live.roundId = "r4";
      if (!state.live.vaultOpened.includes(door)) state.live.vaultOpened = [...state.live.vaultOpened, door];
      const prize = state.rounds.r4.prizes[state.vault[door] ?? -1];
      if (prize) pushFeed(state, now, prize.emoji, `Door ${door}: ${prize.label}!`, prize.multiplier >= 1 ? "good" : "bad");
      audit(state, now, actor, action.type, `Opened vault door ${door}`);
      return;
    }
    case "vault.close":
      state.live.vaultOpened = state.live.vaultOpened.filter((d) => d !== action.door);
      audit(state, now, actor, action.type, `Closed vault door ${action.door}`);
      return;
    case "vault.shuffle":
      if (state.live.vaultOpened.length) throw new GameError("Doors are already open. Close them before reshuffling.");
      shuffleVault(state);
      audit(state, now, actor, action.type, "Reshuffled the vault");
      return;
    case "vault.assign": {
      const door = str(action.door, 4);
      if (!state.rounds.r4.doors.includes(door)) throw new GameError("That door does not exist.");
      const index = int(action.prizeIndex, 0, state.rounds.r4.prizes.length - 1, 0);
      state.vault = { ...state.vault, [door]: index };
      audit(state, now, actor, action.type, `Door ${door} → ${state.rounds.r4.prizes[index]?.label ?? index}`);
      return;
    }

    // ------------------------------------------------------------ admin: credits
    case "adj.add": {
      const target = team(state, action.teamId);
      const amount = int(action.amount, -10_000_000, 10_000_000, 0);
      const reason = str(action.reason, 200).trim();
      if (!amount) throw new GameError("Enter an amount other than zero.");
      if (!reason) throw new GameError("Give a reason so the change can be checked later.");
      const afterRound = action.afterRound === null ? null : round(action.afterRound);
      state.adjustments.push({ id: newId(), teamId: target.id, amount, reason, afterRound, at: now, by: actor.role });
      audit(state, now, actor, action.type, `${amount > 0 ? "+" : ""}${amount} to ${target.name}: ${reason}`);
      return;
    }
    case "adj.remove": {
      const adj = state.adjustments.find((a) => a.id === action.id);
      if (!adj) throw new GameError("That adjustment does not exist.");
      state.adjustments = state.adjustments.filter((a) => a.id !== adj.id);
      audit(state, now, actor, action.type, `Removed adjustment ${adj.amount} (${adj.reason})`);
      return;
    }

    // ------------------------------------------------------------ admin: content
    case "content.set": {
      if (action.section === "caseFile") {
        const caseFile = sanitizeCase(action.value);
        const error = checkCase(caseFile);
        if (error) throw new GameError(error);
        state.caseFile = caseFile;
      } else {
        const roundId = round(action.section);
        const sanitizer = ROUND_SANITIZERS[roundId] as (value: unknown) => GameState["rounds"][typeof roundId];
        (state.rounds as Record<RoundId, unknown>)[roundId] = sanitizer(action.value);
        if (roundId === "r4") {
          const doors = state.rounds.r4.doors;
          state.vault = Object.fromEntries(Object.entries(state.vault).filter(([door]) => doors.includes(door)));
        }
      }
      audit(state, now, actor, action.type, `Edited content: ${action.section}`);
      return;
    }
    case "event.set":
      state.event = sanitizeEvent(action.value, state.event);
      audit(state, now, actor, action.type, "Edited event settings");
      return;
    case "game.reset": {
      if (action.mode === "everything") {
        kickTeams.push(...state.teams.map((t) => t.id));
        Object.assign(state, { ...createInitialState(now), audit: state.audit });
      } else {
        Object.assign(state, {
          live: initialLive(),
          status: pendingStatus(),
          subs: emptySubs(),
          hints: emptyHints(),
          boards: {},
          adjustments: [],
          vault: {},
          feed: [],
          teams: state.teams.map((t) => ({ ...t, checkedIn: false, checkedInAt: null, disqualified: false })),
        });
      }
      audit(state, now, actor, action.type, action.mode === "everything" ? "Factory reset" : "Reset game progress (teams kept)");
      return;
    }
    case "demo.seed": {
      const count = int(action.count, 1, DEMO_TEAMS.length, 8);
      let added = 0;
      for (const [name, emoji] of DEMO_TEAMS) {
        if (added >= count || state.teams.length >= state.event.maxTeams) break;
        if (state.teams.some((t) => t.name === name)) continue;
        const created = createTeam(state, { name, emoji, members: [{ name: "Demo Agent", srn: "" }], contact: "", notes: "Demo team" }, "desk", now);
        created.checkedIn = true;
        created.checkedInAt = now;
        added++;
      }
      audit(state, now, actor, action.type, `Added ${added} demo teams`);
      return;
    }
  }
  const unknown: never = action;
  throw new GameError(`Unknown action ${(unknown as { type: string }).type}`);
}
