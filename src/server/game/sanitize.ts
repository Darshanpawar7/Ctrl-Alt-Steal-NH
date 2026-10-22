// Coerces untrusted input (phones, admin edits, backup files) into
// well-typed values. Every function returns a fresh object of the right
// shape no matter what it is given.

import {
  ROUND_IDS,
  type Board,
  type CaseFile,
  type Clue,
  type EventInfo,
  type Evidence,
  type EvidenceKind,
  type FinaleConfig,
  type Hint,
  type Mark,
  type Member,
  type Option,
  type R1Config,
  type R2Config,
  type R3Config,
  type R4Config,
  type RoundBase,
  type RoundId,
  type SubData,
  type Suspect,
} from "../../shared/types";
import type { TeamInput } from "../../shared/protocol";
import { clamp, newId } from "./util";

type Obj = Record<string, unknown>;

export function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : {};
}

export function str(value: unknown, max = 500, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

export function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

export function int(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(num(value, min, max, fallback));
}

export function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function list<T>(value: unknown, map: (item: unknown, index: number) => T, max = 100): T[] {
  return Array.isArray(value) ? value.slice(0, max).map(map) : [];
}

function strings(value: unknown, maxItems = 20, maxLength = 500): string[] {
  return list(value, (item) => str(item, maxLength), maxItems);
}

/** Keeps ids non-empty and unique so lookups by id stay unambiguous. */
function uniqueIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    let id = item.id.trim().replace(/\s+/g, "-").slice(0, 40);
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    return { ...item, id };
  });
}

// ---------------------------------------------------------------- event + teams

export function sanitizeEvent(value: unknown, fallback: EventInfo): EventInfo {
  const v = obj(value);
  const minMembers = int(v.minMembers, 1, 10, fallback.minMembers);
  return {
    name: str(v.name, 80, fallback.name),
    tagline: str(v.tagline, 200, fallback.tagline),
    club: str(v.club, 80, fallback.club),
    university: str(v.university, 120, fallback.university),
    dateText: str(v.dateText, 120, fallback.dateText),
    startsAt: str(v.startsAt, 40, fallback.startsAt),
    venue: str(v.venue, 160, fallback.venue),
    startingCredits: int(v.startingCredits, 0, 1_000_000, fallback.startingCredits),
    registrationOpen: bool(v.registrationOpen, fallback.registrationOpen),
    requireCheckIn: bool(v.requireCheckIn, fallback.requireCheckIn),
    maxTeams: int(v.maxTeams, 1, 500, fallback.maxTeams),
    minMembers,
    maxMembers: int(v.maxMembers, minMembers, 10, Math.max(minMembers, fallback.maxMembers)),
    instagram: str(v.instagram, 200, fallback.instagram),
    contact: str(v.contact, 200, fallback.contact),
  };
}

export function sanitizeMember(value: unknown): Member {
  const v = obj(value);
  return { name: str(v.name, 60).trim(), srn: str(v.srn, 30).trim().toUpperCase() };
}

export function sanitizeTeamInput(value: unknown): TeamInput {
  const v = obj(value);
  return {
    name: str(v.name, 40).trim().replace(/\s+/g, " "),
    emoji: str(v.emoji, 16, "🐝").trim() || "🐝",
    members: list(v.members, sanitizeMember, 10).filter((m) => m.name),
    contact: str(v.contact, 120).trim(),
    notes: str(v.notes, 500).trim(),
  };
}

// ---------------------------------------------------------------- the case

function sanitizeOption(value: unknown): Option {
  const v = obj(value);
  return { id: str(v.id, 40), name: str(v.name, 80), emoji: str(v.emoji, 16), detail: str(v.detail, 300) };
}

function sanitizeSuspect(value: unknown): Suspect {
  const v = obj(value);
  return {
    id: str(v.id, 40),
    name: str(v.name, 80),
    alias: str(v.alias, 60),
    role: str(v.role, 120),
    emoji: str(v.emoji, 16),
    bio: str(v.bio, 600),
    traits: strings(v.traits, 8, 120),
  };
}

function sanitizeClue(value: unknown): Clue {
  const v = obj(value);
  return { title: str(v.title, 120), text: str(v.text, 1200) };
}

export function sanitizeCase(value: unknown): CaseFile {
  const v = obj(value);
  const solution = obj(v.solution);
  const clues = obj(v.clues);
  const reveal = obj(v.reveal);
  return {
    modelName: str(v.modelName, 40),
    headline: str(v.headline, 200),
    story: strings(v.story, 10, 1200),
    facts: list(v.facts, (f) => ({ time: str(obj(f).time, 20), text: str(obj(f).text, 300) }), 20),
    suspects: uniqueIds(list(v.suspects, sanitizeSuspect, 12)),
    locations: uniqueIds(list(v.locations, sanitizeOption, 12)),
    methods: uniqueIds(list(v.methods, sanitizeOption, 12)),
    solution: { thiefId: str(solution.thiefId, 40), locationId: str(solution.locationId, 40), methodId: str(solution.methodId, 40) },
    clues: { r1: sanitizeClue(clues.r1), r2: sanitizeClue(clues.r2), r3: sanitizeClue(clues.r3), bonus: sanitizeClue(clues.bonus) },
    reveal: {
      thief: str(reveal.thief, 1200),
      location: str(reveal.location, 1200),
      method: str(reveal.method, 1200),
      epilogue: str(reveal.epilogue, 1200),
    },
  };
}

/** Returns an error message if the solution points at options that do not exist. */
export function checkCase(caseFile: CaseFile): string | null {
  const { solution } = caseFile;
  if (!caseFile.suspects.some((s) => s.id === solution.thiefId)) return "The solution's thief must be one of the suspects.";
  if (!caseFile.locations.some((l) => l.id === solution.locationId)) return "The solution's location must be one of the locations.";
  if (!caseFile.methods.some((m) => m.id === solution.methodId)) return "The solution's method must be one of the methods.";
  return null;
}

// ---------------------------------------------------------------- rounds

function sanitizeHint(value: unknown): Hint {
  const v = obj(value);
  return { text: str(v.text, 600), cost: int(v.cost, 0, 100_000, 50) };
}

function sanitizeBase(v: Obj, fallbackDuration: number): RoundBase {
  return {
    title: str(v.title, 80),
    codename: str(v.codename, 40),
    tagline: str(v.tagline, 160),
    howTo: strings(v.howTo, 8, 400),
    durationSec: int(v.durationSec, 10, 3 * 60 * 60, fallbackDuration),
    hints: list(v.hints, sanitizeHint, 6),
  };
}

export function sanitizeR1(value: unknown): R1Config {
  const v = obj(value);
  return {
    ...sanitizeBase(v, 600),
    maxStake: int(v.maxStake, 0, 1_000_000, 600),
    leads: uniqueIds(
      list(v.leads, (l) => {
        const lead = obj(l);
        return {
          id: str(lead.id, 40),
          source: str(lead.source, 80),
          text: str(lead.text, 400),
          odds: Math.round(num(lead.odds, 1, 100, 2) * 100) / 100,
          real: bool(lead.real, false),
        };
      }, 16),
    ),
  };
}

export function sanitizeR2(value: unknown): R2Config {
  const v = obj(value);
  return {
    ...sanitizeBase(v, 900),
    log: str(v.log, 6000),
    speedBonus: list(v.speedBonus, (b) => int(b, 0, 100_000, 0), 10),
    questions: uniqueIds(
      list(v.questions, (q) => {
        const question = obj(q);
        return {
          id: str(question.id, 40),
          prompt: str(question.prompt, 300),
          placeholder: str(question.placeholder, 60),
          answers: strings(question.answers, 12, 120).filter((a) => a.trim()),
          points: int(question.points, 0, 100_000, 100),
        };
      }, 8),
    ),
  };
}

const EVIDENCE_KINDS: EvidenceKind[] = ["statement", "chat", "post", "log", "email", "photo"];

function sanitizeEvidence(value: unknown): Evidence {
  const v = obj(value);
  const kind = str(v.kind, 20) as EvidenceKind;
  const image = str(v.image, 600).trim();
  return {
    id: str(v.id, 40),
    suspectId: str(v.suspectId, 40),
    kind: EVIDENCE_KINDS.includes(kind) ? kind : "statement",
    title: str(v.title, 120),
    meta: str(v.meta, 200),
    body: str(v.body, 2000),
    // Only uploaded image ids or https URLs, never javascript: or data: URLs.
    image: /^[a-z0-9]{10}$/.test(image) || /^https:\/\//i.test(image) ? image : "",
    fake: bool(v.fake, false),
    tell: str(v.tell, 600),
  };
}

export function sanitizeR3(value: unknown): R3Config {
  const v = obj(value);
  return {
    ...sanitizeBase(v, 720),
    pointsCorrect: int(v.pointsCorrect, 0, 100_000, 80),
    pointsWrong: int(v.pointsWrong, 0, 100_000, 40),
    items: uniqueIds(list(v.items, sanitizeEvidence, 16)),
  };
}

export function sanitizeR4(value: unknown): R4Config {
  const v = obj(value);
  const doors = [...new Set(strings(v.doors, 12, 4).map((d) => d.trim().toUpperCase()).filter(Boolean))];
  return {
    ...sanitizeBase(v, 420),
    doors,
    maxWagerPct: int(v.maxWagerPct, 0, 100, 50),
    minWager: int(v.minWager, 0, 1_000_000, 100),
    prizes: list(v.prizes, (p) => {
      const prize = obj(p);
      return {
        label: str(prize.label, 30),
        emoji: str(prize.emoji, 16),
        flavor: str(prize.flavor, 200),
        multiplier: Math.round(num(prize.multiplier, 0, 100, 1) * 100) / 100,
        count: int(prize.count, 0, 12, 1),
        clue: bool(prize.clue, false),
      };
    }, 8),
  };
}

export function sanitizeFinale(value: unknown): FinaleConfig {
  const v = obj(value);
  const payout = obj(v.payout);
  return {
    ...sanitizeBase(v, 480),
    payout: {
      three: num(payout.three, 0, 100, 3),
      two: num(payout.two, 0, 100, 1),
      one: num(payout.one, 0, 100, 0),
      zero: num(payout.zero, 0, 100, 0),
    },
  };
}

export const ROUND_SANITIZERS = {
  r1: sanitizeR1,
  r2: sanitizeR2,
  r3: sanitizeR3,
  r4: sanitizeR4,
  finale: sanitizeFinale,
} as const;

// ---------------------------------------------------------------- submissions

export function sanitizeSub<K extends RoundId>(roundId: K, value: unknown): SubData[K] {
  const v = obj(value);
  switch (roundId) {
    case "r1": {
      const stakes: Record<string, number> = {};
      for (const [key, stake] of Object.entries(obj(v.stakes)).slice(0, 32)) {
        const n = int(stake, 0, 1_000_000, 0);
        if (n > 0) stakes[str(key, 40)] = n;
      }
      return { stakes } as SubData[K];
    }
    case "r2": {
      const answers: Record<string, string> = {};
      for (const [key, answer] of Object.entries(obj(v.answers)).slice(0, 16)) answers[str(key, 40)] = str(answer, 120);
      return { answers } as SubData[K];
    }
    case "r3": {
      const calls: Record<string, "real" | "fake"> = {};
      for (const [key, call] of Object.entries(obj(v.calls)).slice(0, 32)) {
        if (call === "real" || call === "fake") calls[str(key, 40)] = call;
      }
      return { calls } as SubData[K];
    }
    case "r4":
      return {
        choice: v.choice === "vault" ? "vault" : "bank",
        door: str(v.door, 4).toUpperCase(),
        wager: int(v.wager, 0, 1_000_000, 0),
      } as SubData[K];
    case "finale":
      return {
        thiefId: str(v.thiefId, 40),
        locationId: str(v.locationId, 40),
        methodId: str(v.methodId, 40),
        bet: int(v.bet, 0, 10_000_000, 0),
      } as SubData[K];
  }
  throw new Error(`Unknown round ${String(roundId)}`);
}

// ---------------------------------------------------------------- misc

const MARKS: Mark[] = ["none", "maybe", "cleared", "prime"];

export function sanitizeMark(value: unknown): Mark {
  return MARKS.includes(value as Mark) ? (value as Mark) : "none";
}

export function sanitizeBoard(value: unknown): Board {
  const v = obj(value);
  const marks: Record<string, Mark> = {};
  for (const [key, mark] of Object.entries(obj(v.marks)).slice(0, 64)) {
    const m = sanitizeMark(mark);
    if (m !== "none") marks[str(key, 50)] = m;
  }
  return { marks, notes: str(v.notes, 2000) };
}

export function isRoundId(value: unknown): value is RoundId {
  return ROUND_IDS.includes(value as RoundId);
}
