// Shared data model for the whole game. Safe to import from the browser:
// this file holds types and constants only, never answer keys.

export const ROUND_IDS = ["r1", "r2", "r3", "r4", "finale"] as const;
export type RoundId = (typeof ROUND_IDS)[number];
export type RoundStatus = "pending" | "intro" | "open" | "locked" | "revealed";
export type Stage =
  | "lobby"
  | "briefing"
  | "round"
  | "leaderboard"
  | "break"
  | "consolidation"
  | "finalReveal"
  | "podium";
export type Role = "admin" | "volunteer" | "team" | "screen";
export type StaffRole = "admin" | "volunteer";

/** Steps of the final reveal, in order. */
export const REVEAL_STEPS = ["locked", "thief", "location", "method", "epilogue", "standings"] as const;
export type RevealStepName = (typeof REVEAL_STEPS)[number];
export const REVEAL_STEP = {
  locked: 0,
  thief: 1,
  location: 2,
  method: 3,
  epilogue: 4,
  standings: 5,
} as const satisfies Record<RevealStepName, number>;

// ---------------------------------------------------------------- event + teams

export interface EventInfo {
  name: string;
  tagline: string;
  club: string;
  university: string;
  dateText: string;
  /** ISO date-time used for the landing page countdown. */
  startsAt: string;
  venue: string;
  startingCredits: number;
  registrationOpen: boolean;
  requireCheckIn: boolean;
  maxTeams: number;
  minMembers: number;
  maxMembers: number;
  instagram: string;
  contact: string;
}

export interface Member {
  name: string;
  srn: string;
}

export interface Team {
  id: string;
  code: string;
  name: string;
  emoji: string;
  members: Member[];
  contact: string;
  checkedIn: boolean;
  checkedInAt: number | null;
  disqualified: boolean;
  notes: string;
  createdAt: number;
  source: "online" | "desk";
}

// ---------------------------------------------------------------- the case

export interface Suspect {
  id: string;
  name: string;
  alias: string;
  role: string;
  emoji: string;
  bio: string;
  /** Short facts printed on the suspect card, e.g. "Keycard: revoked". */
  traits: string[];
}

export interface Option {
  id: string;
  name: string;
  emoji: string;
  detail: string;
}

export interface Clue {
  title: string;
  text: string;
}

export interface TimelineFact {
  time: string;
  text: string;
}

export interface CaseFile {
  modelName: string;
  headline: string;
  story: string[];
  facts: TimelineFact[];
  suspects: Suspect[];
  locations: Option[];
  methods: Option[];
  solution: { thiefId: string; locationId: string; methodId: string };
  clues: { r1: Clue; r2: Clue; r3: Clue; bonus: Clue };
  reveal: { thief: string; location: string; method: string; epilogue: string };
}

// ---------------------------------------------------------------- rounds

export interface Hint {
  text: string;
  cost: number;
}

export interface RoundBase {
  title: string;
  codename: string;
  tagline: string;
  howTo: string[];
  durationSec: number;
  hints: Hint[];
}

export interface Lead {
  id: string;
  source: string;
  text: string;
  odds: number;
  real: boolean;
}

export interface R1Config extends RoundBase {
  leads: Lead[];
  maxStake: number;
}

export interface Question {
  id: string;
  prompt: string;
  placeholder: string;
  /** Accepted answers. Matching ignores case, spaces and punctuation. */
  answers: string[];
  points: number;
}

export interface R2Config extends RoundBase {
  log: string;
  questions: Question[];
  /** Bonus for the 1st, 2nd, 3rd... team to lock in a fully correct answer. */
  speedBonus: number[];
}

export type EvidenceKind = "statement" | "chat" | "post" | "log" | "email" | "photo";

export interface Evidence {
  id: string;
  suspectId: string;
  kind: EvidenceKind;
  title: string;
  meta: string;
  body: string;
  /** Uploaded image id (served at /api/img/:id) or an absolute https URL. */
  image: string;
  fake: boolean;
  /** Shown at the reveal: the giveaway that proves real or fake. */
  tell: string;
}

export interface R3Config extends RoundBase {
  items: Evidence[];
  pointsCorrect: number;
  pointsWrong: number;
}

export interface VaultPrize {
  label: string;
  emoji: string;
  flavor: string;
  multiplier: number;
  count: number;
  clue: boolean;
}

export interface R4Config extends RoundBase {
  doors: string[];
  prizes: VaultPrize[];
  maxWagerPct: number;
  minWager: number;
}

export interface FinaleConfig extends RoundBase {
  /** How many times the bet comes back, by number of correct parts. */
  payout: { three: number; two: number; one: number; zero: number };
}

export interface Rounds {
  r1: R1Config;
  r2: R2Config;
  r3: R3Config;
  r4: R4Config;
  finale: FinaleConfig;
}

// ---------------------------------------------------------------- submissions

export interface R1Sub {
  stakes: Record<string, number>;
}
export interface R2Sub {
  answers: Record<string, string>;
}
export type Call = "real" | "fake";
export interface R3Sub {
  calls: Record<string, Call>;
}
export interface R4Sub {
  choice: "bank" | "vault";
  door: string;
  wager: number;
}
export interface FinaleSub {
  thiefId: string;
  locationId: string;
  methodId: string;
  bet: number;
}

export interface SubData {
  r1: R1Sub;
  r2: R2Sub;
  r3: R3Sub;
  r4: R4Sub;
  finale: FinaleSub;
}

export interface Submission<T> {
  data: T;
  savedAt: number;
  /** Set only when the team pressed "lock in" before time ran out. */
  lockedAt: number | null;
  by: Role;
}

export type SubMap = { [K in RoundId]: Record<string, Submission<SubData[K]>> };

// ---------------------------------------------------------------- deduction board

export type Mark = "none" | "maybe" | "cleared" | "prime";
export interface Board {
  marks: Record<string, Mark>;
  notes: string;
}

// ---------------------------------------------------------------- live + log

export interface TimerState {
  label: string;
  durationMs: number;
  endsAt: number | null;
  pausedLeftMs: number | null;
}

export interface Announcement {
  id: string;
  text: string;
  at: number;
}

export interface LiveState {
  stage: Stage;
  roundId: RoundId | null;
  timer: TimerState;
  leaderboardHidden: boolean;
  announcement: Announcement | null;
  revealStep: number;
  vaultOpened: string[];
}

export interface Adjustment {
  id: string;
  teamId: string;
  amount: number;
  reason: string;
  afterRound: RoundId | null;
  at: number;
  by: Role;
}

export type Tone = "info" | "good" | "bad" | "hype";
export interface FeedItem {
  id: string;
  at: number;
  icon: string;
  text: string;
  tone: Tone;
}

export interface AuditEntry {
  id: string;
  at: number;
  by: Role;
  type: string;
  summary: string;
}

export interface GameState {
  schema: 1;
  updatedAt: number;
  event: EventInfo;
  live: LiveState;
  caseFile: CaseFile;
  rounds: Rounds;
  status: Record<RoundId, RoundStatus>;
  teams: Team[];
  subs: SubMap;
  hints: Record<RoundId, Record<string, number[]>>;
  boards: Record<string, Board>;
  adjustments: Adjustment[];
  /** Secret: door label -> index into rounds.r4.prizes. */
  vault: Record<string, number>;
  feed: FeedItem[];
  audit: AuditEntry[];
}

// ---------------------------------------------------------------- scoring

export interface LedgerRow {
  key: string;
  roundId: RoundId | null;
  label: string;
  delta: number;
  detail: string;
  pending?: boolean;
}

export interface TeamLedger {
  teamId: string;
  rows: LedgerRow[];
  total: number;
  /** Credits after each scored stage. "start" is the opening balance. */
  after: Partial<Record<RoundId | "start", number>>;
  /** Credits a team can stake in each round (after any hints bought in it): the cap for stakes and bets. */
  before: Record<RoundId, number>;
}

export interface Standing {
  teamId: string;
  credits: number;
  rank: number;
  prevRank: number | null;
}

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  why: string;
}
