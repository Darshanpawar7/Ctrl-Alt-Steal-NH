// Creating, restoring and ticking the game state.

import { produce } from "immer";
import {
  ROUND_IDS,
  type Adjustment,
  type AuditEntry,
  type FeedItem,
  type GameState,
  type LiveState,
  type Role,
  type RoundId,
  type RoundStatus,
  type Stage,
  type SubMap,
  type Team,
  type TimerState,
} from "../../shared/types";
import { defaultCase, defaultEvent, defaultRounds } from "./content";
import {
  ROUND_SANITIZERS,
  bool,
  checkCase,
  int,
  isRoundId,
  list,
  obj,
  sanitizeBoard,
  sanitizeCase,
  sanitizeEvent,
  sanitizeMember,
  sanitizeSub,
  str,
} from "./sanitize";
import { newId, normalizeCode } from "./util";

export const FEED_LIMIT = 50;
export const AUDIT_LIMIT = 600;

export function emptyTimer(): TimerState {
  return { label: "", durationMs: 0, endsAt: null, pausedLeftMs: null };
}

export function initialLive(): LiveState {
  return {
    stage: "lobby",
    roundId: null,
    timer: emptyTimer(),
    leaderboardHidden: false,
    announcement: null,
    revealStep: 0,
    vaultOpened: [],
  };
}

export function emptySubs(): SubMap {
  return { r1: {}, r2: {}, r3: {}, r4: {}, finale: {} };
}

export function emptyHints(): GameState["hints"] {
  return { r1: {}, r2: {}, r3: {}, r4: {}, finale: {} };
}

export function pendingStatus(): Record<RoundId, RoundStatus> {
  return { r1: "pending", r2: "pending", r3: "pending", r4: "pending", finale: "pending" };
}

export function createInitialState(now: number): GameState {
  return {
    schema: 1,
    updatedAt: now,
    event: defaultEvent(),
    live: initialLive(),
    caseFile: defaultCase(),
    rounds: defaultRounds(),
    status: pendingStatus(),
    teams: [],
    subs: emptySubs(),
    hints: emptyHints(),
    boards: {},
    adjustments: [],
    vault: {},
    feed: [],
    audit: [],
  };
}

export function timerRunning(timer: TimerState): boolean {
  return timer.endsAt !== null && timer.pausedLeftMs === null;
}

/**
 * Called by the Durable Object alarm. When the clock runs out on an open
 * round, the round locks so no more answers are accepted.
 */
export function tick(state: GameState, now: number): GameState | null {
  const { timer, stage, roundId } = state.live;
  if (!timerRunning(timer) || timer.endsAt! > now) return null;
  if (stage !== "round" || !roundId || state.status[roundId] !== "open") return null;
  return produce(state, (draft) => {
    draft.status[roundId] = "locked";
    draft.updatedAt = now;
    pushFeed(draft as GameState, now, "⏰", `Time! ${draft.rounds[roundId].codename} is locked.`, "bad");
  });
}

export function pushFeed(state: GameState, now: number, icon: string, text: string, tone: FeedItem["tone"]): void {
  state.feed = [...state.feed, { id: newId(), at: now, icon, text, tone }].slice(-FEED_LIMIT);
}

export function pushAudit(state: GameState, now: number, by: Role, type: string, summary: string): void {
  state.audit = [...state.audit, { id: newId(), at: now, by, type, summary }].slice(-AUDIT_LIMIT);
}

// ---------------------------------------------------------------- restore

const STAGES: Stage[] = ["lobby", "briefing", "round", "leaderboard", "break", "consolidation", "finalReveal", "podium"];
const STATUSES: RoundStatus[] = ["pending", "intro", "open", "locked", "revealed"];
const ROLES: Role[] = ["admin", "volunteer", "team", "screen"];

function sanitizeTeam(value: unknown, now: number): Team {
  const v = obj(value);
  return {
    id: str(v.id, 40) || newId(),
    code: normalizeCode(str(v.code, 20)),
    name: str(v.name, 40) || "Unnamed crew",
    emoji: str(v.emoji, 16) || "🐝",
    members: list(v.members, sanitizeMember, 10),
    contact: str(v.contact, 120),
    checkedIn: bool(v.checkedIn, false),
    checkedInAt: typeof v.checkedInAt === "number" ? v.checkedInAt : null,
    disqualified: bool(v.disqualified, false),
    notes: str(v.notes, 500),
    createdAt: int(v.createdAt, 0, Number.MAX_SAFE_INTEGER, now),
    source: v.source === "desk" ? "desk" : "online",
  };
}

function sanitizeLive(value: unknown): LiveState {
  const v = obj(value);
  const timer = obj(v.timer);
  const announcement = obj(v.announcement);
  const nullableInt = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : null);
  return {
    stage: STAGES.includes(v.stage as Stage) ? (v.stage as Stage) : "lobby",
    roundId: isRoundId(v.roundId) ? v.roundId : null,
    timer: {
      label: str(timer.label, 120),
      durationMs: int(timer.durationMs, 0, 24 * 3600_000, 0),
      endsAt: nullableInt(timer.endsAt),
      pausedLeftMs: nullableInt(timer.pausedLeftMs),
    },
    leaderboardHidden: bool(v.leaderboardHidden, false),
    announcement: announcement.text ? { id: str(announcement.id, 20) || newId(), text: str(announcement.text, 280), at: int(announcement.at, 0, Number.MAX_SAFE_INTEGER, 0) } : null,
    revealStep: int(v.revealStep, 0, 10, 0),
    vaultOpened: list(v.vaultOpened, (d) => str(d, 4), 12),
  };
}

/** Validates a downloaded backup before it replaces the live game. */
export function restoreState(raw: unknown, now: number): GameState {
  const v = obj(raw);
  if (v.schema !== 1) throw new Error("This file is not a Ctrl+Alt+Steal backup.");

  const caseFile = sanitizeCase(v.caseFile);
  const caseError = checkCase(caseFile);
  if (caseError) throw new Error(caseError);
  const roundsRaw = obj(v.rounds);

  const seenCodes = new Set<string>();
  const teams = list(v.teams, (t) => sanitizeTeam(t, now), 500).filter((team) => {
    if (!team.code || seenCodes.has(team.code)) return false;
    seenCodes.add(team.code);
    return true;
  });
  const teamIds = new Set(teams.map((t) => t.id));

  const statusRaw = obj(v.status);
  const status = pendingStatus();
  for (const id of ROUND_IDS) if (STATUSES.includes(statusRaw[id] as RoundStatus)) status[id] = statusRaw[id] as RoundStatus;

  const subs = emptySubs();
  const hints = emptyHints();
  const subsRaw = obj(v.subs);
  const hintsRaw = obj(v.hints);
  for (const roundId of ROUND_IDS) {
    for (const [teamId, sub] of Object.entries(obj(subsRaw[roundId]))) {
      if (!teamIds.has(teamId)) continue;
      const s = obj(sub);
      (subs[roundId] as Record<string, unknown>)[teamId] = {
        data: sanitizeSub(roundId, s.data),
        savedAt: int(s.savedAt, 0, Number.MAX_SAFE_INTEGER, now),
        lockedAt: typeof s.lockedAt === "number" ? s.lockedAt : null,
        by: ROLES.includes(s.by as Role) ? s.by : "team",
      };
    }
    for (const [teamId, bought] of Object.entries(obj(hintsRaw[roundId]))) {
      if (teamIds.has(teamId)) hints[roundId][teamId] = [...new Set(list(bought, (i) => int(i, 0, 20, 0), 20))];
    }
  }

  const boards: GameState["boards"] = {};
  for (const [teamId, board] of Object.entries(obj(v.boards))) if (teamIds.has(teamId)) boards[teamId] = sanitizeBoard(board);

  const adjustments = list(v.adjustments, (a): Adjustment => {
    const adj = obj(a);
    return {
      id: str(adj.id, 20) || newId(),
      teamId: str(adj.teamId, 40),
      amount: int(adj.amount, -10_000_000, 10_000_000, 0),
      reason: str(adj.reason, 200),
      afterRound: isRoundId(adj.afterRound) ? adj.afterRound : null,
      at: int(adj.at, 0, Number.MAX_SAFE_INTEGER, now),
      by: ROLES.includes(adj.by as Role) ? (adj.by as Role) : "admin",
    };
  }, 2000).filter((a) => teamIds.has(a.teamId) && a.amount !== 0);

  const vault: Record<string, number> = {};
  for (const [door, index] of Object.entries(obj(v.vault))) vault[str(door, 4)] = int(index, 0, 20, 0);

  const logItem = (x: unknown) => obj(x);
  return {
    schema: 1,
    updatedAt: now,
    event: sanitizeEvent(v.event, defaultEvent()),
    live: sanitizeLive(v.live),
    caseFile,
    rounds: {
      r1: ROUND_SANITIZERS.r1(roundsRaw.r1),
      r2: ROUND_SANITIZERS.r2(roundsRaw.r2),
      r3: ROUND_SANITIZERS.r3(roundsRaw.r3),
      r4: ROUND_SANITIZERS.r4(roundsRaw.r4),
      finale: ROUND_SANITIZERS.finale(roundsRaw.finale),
    },
    status,
    teams,
    subs,
    hints,
    boards,
    adjustments,
    vault,
    feed: list(v.feed, (f): FeedItem => {
      const item = logItem(f);
      const tone = item.tone;
      return {
        id: str(item.id, 20) || newId(),
        at: int(item.at, 0, Number.MAX_SAFE_INTEGER, now),
        icon: str(item.icon, 16),
        text: str(item.text, 300),
        tone: tone === "good" || tone === "bad" || tone === "hype" ? tone : "info",
      };
    }, 500).slice(-FEED_LIMIT),
    audit: list(v.audit, (a): AuditEntry => {
      const item = logItem(a);
      return {
        id: str(item.id, 20) || newId(),
        at: int(item.at, 0, Number.MAX_SAFE_INTEGER, now),
        by: ROLES.includes(item.by as Role) ? (item.by as Role) : "admin",
        type: str(item.type, 40),
        summary: str(item.summary, 400),
      };
    }, 5000).slice(-AUDIT_LIMIT),
  };
}
