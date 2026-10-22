// Wire protocol between browsers and the game server, plus the filtered
// "views" each role receives. Types and one small merge helper only: safe
// for the browser bundle.

import type {
  Adjustment,
  AuditEntry,
  Badge,
  Board,
  Clue,
  EventInfo,
  FeedItem,
  GameState,
  LedgerRow,
  LiveState,
  Mark,
  Member,
  Option,
  Role,
  RoundBase,
  RoundId,
  RoundStatus,
  Stage,
  Standing,
  SubData,
  Submission,
  Suspect,
  Team,
  TeamLedger,
  TimelineFact,
  VaultPrize,
} from "./types";

// ---------------------------------------------------------------- actions

export interface TeamInput {
  name: string;
  emoji: string;
  members: Member[];
  contact: string;
  notes?: string;
}

export type ContentSection = "caseFile" | RoundId;

export type Action =
  // team
  | { type: "sub.save"; roundId: RoundId; data: unknown; lock?: boolean }
  | { type: "hint.buy"; roundId: RoundId; index: number }
  | { type: "board.mark"; key: string; mark: Mark }
  | { type: "board.notes"; notes: string }
  // staff (admin + volunteer)
  | { type: "team.add"; team: TeamInput; checkIn?: boolean }
  | { type: "team.update"; id: string; team: TeamInput }
  | { type: "team.checkin"; id: string; value: boolean }
  | { type: "sub.staffSet"; roundId: RoundId; teamId: string; data: unknown; lock: boolean }
  // admin only
  | { type: "team.remove"; id: string }
  | { type: "team.dq"; id: string; value: boolean }
  | { type: "team.newCode"; id: string }
  | { type: "sub.clear"; roundId: RoundId; teamId: string }
  | { type: "sub.unlock"; roundId: RoundId; teamId: string }
  | { type: "hint.set"; roundId: RoundId; teamId: string; indexes: number[] }
  | { type: "stage.set"; stage: Stage; roundId?: RoundId | null }
  | { type: "round.set"; roundId: RoundId; status: RoundStatus }
  | { type: "timer.start"; seconds: number; label: string }
  | { type: "timer.pause" }
  | { type: "timer.resume" }
  | { type: "timer.add"; seconds: number }
  | { type: "timer.clear" }
  | { type: "live.leaderboard"; hidden: boolean }
  | { type: "live.revealStep"; step: number }
  | { type: "announce"; text: string }
  | { type: "vault.open"; door: string }
  | { type: "vault.close"; door: string }
  | { type: "vault.shuffle" }
  | { type: "vault.assign"; door: string; prizeIndex: number }
  | { type: "adj.add"; teamId: string; amount: number; reason: string; afterRound: RoundId | null }
  | { type: "adj.remove"; id: string }
  | { type: "content.set"; section: ContentSection; value: unknown }
  | { type: "event.set"; value: unknown }
  | { type: "game.reset"; mode: "progress" | "everything" }
  | { type: "demo.seed"; count: number };

export type ActionType = Action["type"];

// ---------------------------------------------------------------- HTTP

/** GET /api/public: what the landing page needs before anyone signs in. */
export interface PublicInfo {
  event: EventInfo;
  teamCount: number;
  stage: Stage;
  modelName: string;
  story: string[];
  facts: TimelineFact[];
  suspects: Pick<Suspect, "id" | "name" | "alias" | "role" | "emoji">[];
  rounds: { id: RoundId; codename: string; title: string; tagline: string; durationSec: number }[];
}

export interface RegisterResult {
  ok: true;
  team: { name: string; emoji: string; code: string };
}

// ---------------------------------------------------------------- messages

export type ClientMessage =
  | { t: "hello"; role: "screen" }
  | { t: "hello"; role: "team"; code: string }
  | { t: "hello"; role: "admin" | "volunteer"; password: string }
  | { t: "act"; id: string; action: Action }
  | { t: "ping" };

export type ServerMessage =
  | { t: "welcome"; role: Role; teamId: string | null }
  | { t: "denied"; reason: string }
  | { t: "state"; view: View; serverNow: number }
  /** Only the sections that changed; merge into the last view. */
  | { t: "patch"; view: ViewPatch; serverNow: number }
  | { t: "ack"; id: string; ok: boolean; error?: string }
  | { t: "pong"; serverNow: number };

// ---------------------------------------------------------------- views

export interface PublicTeam {
  id: string;
  name: string;
  emoji: string;
  checkedIn: boolean;
  disqualified: boolean;
  online: boolean;
}

export interface PublicCase {
  modelName: string;
  headline: string;
  story: string[];
  facts: TimelineFact[];
  suspects: Suspect[];
  locations: Option[];
  methods: Option[];
  /** Clues already revealed to the whole room. */
  clues: Partial<Record<"r1" | "r2" | "r3", Clue>>;
  /** Filled in step by step during the final reveal. */
  solution: { thiefId?: string; locationId?: string; methodId?: string };
  reveal: { thief?: string; location?: string; method?: string; epilogue?: string };
}

type Base = Omit<RoundBase, "hints"> & { hintCosts: number[] };

export interface PublicR1 extends Base {
  maxStake: number;
  leads: { id: string; source: string; text: string; odds: number; real?: boolean }[] | null;
}
export interface PublicR2 extends Base {
  log: string | null;
  questions: { id: string; prompt: string; placeholder: string; points: number; answers?: string[] }[] | null;
  speedBonus: number[];
}
export interface PublicEvidence {
  id: string;
  suspectId: string;
  kind: string;
  title: string;
  meta: string;
  body: string;
  imageSrc: string;
  fake?: boolean;
  tell?: string;
}
export interface PublicR3 extends Base {
  items: PublicEvidence[] | null;
  pointsCorrect: number;
  pointsWrong: number;
}
export interface PublicR4 extends Base {
  doors: string[];
  prizes: VaultPrize[];
  maxWagerPct: number;
  minWager: number;
  /** door -> prize index, only for doors already opened. */
  opened: Record<string, number>;
}
export interface PublicFinale extends Base {
  payout: { three: number; two: number; one: number; zero: number };
}

export interface PublicRounds {
  r1: PublicR1;
  r2: PublicR2;
  r3: PublicR3;
  r4: PublicR4;
  finale: PublicFinale;
}

export interface RoundStats {
  /** Teams with a saved submission for each round. */
  submitted: Record<RoundId, string[]>;
  /** Teams that pressed lock-in, per round. */
  lockedIn: Record<RoundId, string[]>;
  /** R1, after lock: total credits staked per lead and how many teams backed it. */
  market: Record<string, { total: number; teams: number }> | null;
  /** R2, after reveal: crews that won the speed bonus, fastest first. */
  speedWinners: string[] | null;
  /** R3, after reveal: how the room voted on each item. */
  votes: Record<string, { real: number; fake: number }> | null;
  /** R4, after lock: who stands at which door. */
  vaultPicks: { door: string; teams: { teamId: string; wager: number }[] }[] | null;
  vaultBanked: string[] | null;
  /** Finale, during the reveal: how many teams named each answer. */
  finalePicks: { thief: Record<string, number>; location: Record<string, number>; method: Record<string, number>; potTotal: number } | null;
  /** Finale, once standings are revealed: each team's answer and result. */
  finaleResults: { teamId: string; correct: number; bet: number; delta: number }[] | null;
}

export interface PublicView {
  kind: "public";
  event: EventInfo;
  live: LiveState;
  status: Record<RoundId, RoundStatus>;
  caseFile: PublicCase;
  rounds: PublicRounds;
  teams: PublicTeam[];
  /** Null while the leaderboard is blacked out. */
  standings: Standing[] | null;
  stats: RoundStats;
  feed: FeedItem[];
  badges: Record<string, Badge[]> | null;
}

export interface MyRoundResult {
  roundId: RoundId;
  rows: LedgerRow[];
  delta: number;
  pending: boolean;
}

export interface TeamView extends Omit<PublicView, "kind"> {
  kind: "team";
  me: {
    team: Team;
    credits: number;
    rank: number | null;
    subs: { [K in RoundId]?: Submission<SubData[K]> };
    hints: { [K in RoundId]?: { index: number; text: string }[] };
    board: Board;
    results: MyRoundResult[];
    bonusClue: Clue | null;
    badges: Badge[];
    /** Credits available to stake in the current round. */
    budget: number;
  };
}

export interface Presence {
  screens: number;
  staff: number;
  teams: Record<string, number>;
}

export interface StaffView extends Omit<PublicView, "kind"> {
  kind: "staff";
  role: "admin" | "volunteer";
  staff: {
    teams: Team[];
    subs: GameState["subs"];
    hints: GameState["hints"];
    ledgers: Record<string, TeamLedger>;
    allStandings: Standing[];
    adjustments: Adjustment[];
    presence: Presence;
    audit: AuditEntry[];
    allBadges: Record<string, Badge[]>;
  };
  /** Content with every answer key, plus the vault layout. Admin only. */
  full: AdminSecrets | null;
}

export type AdminSecrets = Pick<GameState, "caseFile" | "rounds" | "vault">;

export type View = PublicView | TeamView | StaffView;

export type ViewPatch = { kind: View["kind"] } & Partial<Omit<StaffView, "kind" | "staff">> &
  Partial<Omit<TeamView, "kind">> & { staff?: Partial<StaffView["staff"]> };

/** Applies a patch the way every client does. Shared so tests can replay it. */
export function applyPatch(prev: View, patch: ViewPatch): View {
  const next = { ...prev, ...patch } as View;
  if (prev.kind === "staff" && next.kind === "staff" && patch.staff) next.staff = { ...prev.staff, ...patch.staff };
  return next;
}
