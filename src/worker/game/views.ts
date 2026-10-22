// Builds what each connected screen is allowed to see. This is the only
// path from game state to the network, so every answer key is filtered
// out here until the matching reveal.

import type {
  MyRoundResult,
  Presence,
  PublicCase,
  PublicRounds,
  PublicView,
  RoundStats,
  StaffView,
  TeamView,
} from "../../shared/protocol";
import {
  REVEAL_STEP,
  ROUND_IDS,
  type Badge,
  type GameState,
  type RoundBase,
  type RoundId,
  type Standing,
  type TeamLedger,
} from "../../shared/types";
import { computeBadges, computeLedgers, computeStandings, finaleCorrectCount, rankedTeamIds } from "./scoring";

export interface ViewContext {
  ledgers: Record<string, TeamLedger>;
  standings: Standing[];
  badges: Record<string, Badge[]>;
  presence: Presence;
}

export function buildContext(state: GameState, presence: Presence): ViewContext {
  const ledgers = computeLedgers(state);
  return { ledgers, standings: computeStandings(state, ledgers), badges: computeBadges(state, ledgers), presence };
}

export function imageSrc(image: string): string {
  if (/^[a-z0-9]{10}$/.test(image)) return `/api/img/${image}`;
  return /^https:\/\//i.test(image) ? image : "";
}

function base(cfg: RoundBase) {
  const { hints, ...rest } = cfg;
  return { ...rest, hintCosts: hints.map((h) => h.cost) };
}

function publicCase(state: GameState): PublicCase {
  const c = state.caseFile;
  const shown = (step: number) => state.status.finale === "revealed" && state.live.revealStep >= step;
  const clues: PublicCase["clues"] = {};
  for (const id of ["r1", "r2", "r3"] as const) if (state.status[id] === "revealed") clues[id] = c.clues[id];
  return {
    modelName: c.modelName,
    headline: c.headline,
    story: c.story,
    facts: c.facts,
    suspects: c.suspects,
    locations: c.locations,
    methods: c.methods,
    clues,
    solution: {
      thiefId: shown(REVEAL_STEP.thief) ? c.solution.thiefId : undefined,
      locationId: shown(REVEAL_STEP.location) ? c.solution.locationId : undefined,
      methodId: shown(REVEAL_STEP.method) ? c.solution.methodId : undefined,
    },
    reveal: {
      thief: shown(REVEAL_STEP.thief) ? c.reveal.thief : undefined,
      location: shown(REVEAL_STEP.location) ? c.reveal.location : undefined,
      method: shown(REVEAL_STEP.method) ? c.reveal.method : undefined,
      epilogue: shown(REVEAL_STEP.epilogue) ? c.reveal.epilogue : undefined,
    },
  };
}

function publicRounds(state: GameState): PublicRounds {
  const { r1, r2, r3, r4, finale } = state.rounds;
  const visible = (id: RoundId) => state.status[id] !== "pending";
  const revealed = (id: RoundId) => state.status[id] === "revealed";
  const opened: Record<string, number> = {};
  for (const door of state.live.vaultOpened) if (state.vault[door] !== undefined) opened[door] = state.vault[door]!;

  return {
    r1: {
      ...base(r1),
      maxStake: r1.maxStake,
      leads: visible("r1")
        ? r1.leads.map((l) => ({ id: l.id, source: l.source, text: l.text, odds: l.odds, real: revealed("r1") ? l.real : undefined }))
        : null,
    },
    r2: {
      ...base(r2),
      speedBonus: r2.speedBonus,
      log: visible("r2") ? r2.log : null,
      questions: visible("r2")
        ? r2.questions.map((q) => ({ id: q.id, prompt: q.prompt, placeholder: q.placeholder, points: q.points, answers: revealed("r2") ? q.answers : undefined }))
        : null,
    },
    r3: {
      ...base(r3),
      pointsCorrect: r3.pointsCorrect,
      pointsWrong: r3.pointsWrong,
      items: visible("r3")
        ? r3.items.map((item) => ({
            id: item.id,
            suspectId: item.suspectId,
            kind: item.kind,
            title: item.title,
            meta: item.meta,
            body: item.body,
            imageSrc: imageSrc(item.image),
            fake: revealed("r3") ? item.fake : undefined,
            tell: revealed("r3") ? item.tell : undefined,
          }))
        : null,
    },
    r4: { ...base(r4), doors: r4.doors, prizes: r4.prizes, maxWagerPct: r4.maxWagerPct, minWager: r4.minWager, opened },
    finale: { ...base(finale), payout: finale.payout },
  };
}

function stats(state: GameState, ctx: ViewContext): RoundStats {
  const submitted = {} as RoundStats["submitted"];
  const lockedIn = {} as RoundStats["lockedIn"];
  for (const id of ROUND_IDS) {
    submitted[id] = Object.keys(state.subs[id]);
    lockedIn[id] = Object.entries(state.subs[id]).filter(([, s]) => s.lockedAt !== null).map(([teamId]) => teamId);
  }
  const ranked = new Set(rankedTeamIds(state));
  const afterLock = (id: RoundId) => state.status[id] === "locked" || state.status[id] === "revealed";

  let market: RoundStats["market"] = null;
  if (afterLock("r1")) {
    market = Object.fromEntries(state.rounds.r1.leads.map((l) => [l.id, { total: 0, teams: 0 }]));
    for (const [teamId, sub] of Object.entries(state.subs.r1)) {
      if (!ranked.has(teamId)) continue;
      for (const [leadId, stake] of Object.entries(sub.data.stakes)) {
        const entry = market[leadId];
        if (entry && stake > 0) {
          entry.total += stake;
          entry.teams += 1;
        }
      }
    }
  }

  let votes: RoundStats["votes"] = null;
  if (state.status.r3 === "revealed") {
    votes = Object.fromEntries(state.rounds.r3.items.map((i) => [i.id, { real: 0, fake: 0 }]));
    for (const [teamId, sub] of Object.entries(state.subs.r3)) {
      if (!ranked.has(teamId)) continue;
      for (const [itemId, call] of Object.entries(sub.data.calls)) if (votes[itemId]) votes[itemId][call] += 1;
    }
  }

  let vaultPicks: RoundStats["vaultPicks"] = null;
  let vaultBanked: RoundStats["vaultBanked"] = null;
  if (afterLock("r4")) {
    vaultPicks = state.rounds.r4.doors.map((door) => ({ door, teams: [] as { teamId: string; wager: number }[] }));
    vaultBanked = [];
    for (const teamId of ranked) {
      const sub = state.subs.r4[teamId];
      const pick = sub?.data.choice === "vault" ? vaultPicks.find((p) => p.door === sub.data.door) : undefined;
      if (pick && sub) pick.teams.push({ teamId, wager: sub.data.wager });
      else vaultBanked.push(teamId);
    }
  }

  let finalePicks: RoundStats["finalePicks"] = null;
  let finaleResults: RoundStats["finaleResults"] = null;
  if (state.status.finale === "revealed") {
    finalePicks = { thief: {}, location: {}, method: {}, potTotal: 0 };
    for (const [teamId, sub] of Object.entries(state.subs.finale)) {
      if (!ranked.has(teamId)) continue;
      const bump = (record: Record<string, number>, key: string) => {
        if (key) record[key] = (record[key] ?? 0) + 1;
      };
      bump(finalePicks.thief, sub.data.thiefId);
      bump(finalePicks.location, sub.data.locationId);
      bump(finalePicks.method, sub.data.methodId);
      finalePicks.potTotal += Math.min(sub.data.bet, ctx.ledgers[teamId]?.before.finale ?? 0);
    }
    if (state.live.revealStep >= REVEAL_STEP.standings) {
      finaleResults = [...ranked].map((teamId) => {
        const row = ctx.ledgers[teamId]?.rows.find((r) => r.key === "finale");
        const bet = Math.min(state.subs.finale[teamId]?.data.bet ?? 0, ctx.ledgers[teamId]?.before.finale ?? 0);
        return { teamId, correct: finaleCorrectCount(state, teamId), bet, delta: row?.delta ?? 0 };
      });
    }
  }

  return { submitted, lockedIn, market, votes, vaultPicks, vaultBanked, finalePicks, finaleResults };
}

function badgesVisible(state: GameState): boolean {
  return state.live.stage === "podium" || (state.live.stage === "finalReveal" && state.live.revealStep >= REVEAL_STEP.standings);
}

export function publicView(state: GameState, ctx: ViewContext): PublicView {
  const online = ctx.presence.teams;
  const ranked = new Set(rankedTeamIds(state));
  return {
    kind: "public",
    event: state.event,
    live: state.live,
    status: state.status,
    caseFile: publicCase(state),
    rounds: publicRounds(state),
    teams: state.teams.map((t) => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      members: t.members.map((m) => m.name),
      checkedIn: t.checkedIn,
      disqualified: t.disqualified,
      online: (online[t.id] ?? 0) > 0,
    })),
    standings: state.live.leaderboardHidden ? null : ctx.standings,
    stats: stats(state, ctx),
    feed: state.feed.slice(-15),
    badges: badgesVisible(state) ? Object.fromEntries(Object.entries(ctx.badges).filter(([id]) => ranked.has(id))) : null,
  };
}

export function teamView(state: GameState, ctx: ViewContext, teamId: string, shared: PublicView = publicView(state, ctx)): TeamView | null {
  const team = state.teams.find((t) => t.id === teamId);
  const ledger = ctx.ledgers[teamId];
  if (!team || !ledger) return null;
  const { kind: _kind, ...rest } = shared;

  const subs: TeamView["me"]["subs"] = {};
  const hints: TeamView["me"]["hints"] = {};
  for (const id of ROUND_IDS) {
    const sub = state.subs[id][teamId];
    if (sub) (subs as Record<string, unknown>)[id] = sub;
    const bought = state.hints[id][teamId] ?? [];
    if (bought.length) hints[id] = bought.map((index) => ({ index, text: state.rounds[id].hints[index]?.text ?? "" }));
  }

  const results: MyRoundResult[] = ROUND_IDS.map((roundId) => {
    const rows = ledger.rows.filter((r) => r.roundId === roundId);
    return { roundId, rows, delta: rows.reduce((total, r) => total + r.delta, 0), pending: rows.some((r) => r.pending) };
  }).filter((r) => r.rows.length > 0);

  const r4 = state.subs.r4[teamId];
  const r4Prize = r4 && r4.data.choice === "vault" && state.live.vaultOpened.includes(r4.data.door)
    ? state.rounds.r4.prizes[state.vault[r4.data.door] ?? -1]
    : undefined;

  const standing = ctx.standings.find((s) => s.teamId === teamId);
  const currentRound = state.live.roundId;
  return {
    ...rest,
    kind: "team",
    me: {
      team,
      credits: ledger.total,
      rank: state.live.leaderboardHidden ? null : (standing?.rank ?? null),
      subs,
      hints,
      board: state.boards[teamId] ?? { marks: {}, notes: "" },
      results,
      bonusClue: r4Prize?.clue ? state.caseFile.clues.bonus : null,
      badges: badgesVisible(state) ? (ctx.badges[teamId] ?? []) : [],
      budget: currentRound ? ledger.before[currentRound] : ledger.total,
    },
  };
}

export function staffView(state: GameState, ctx: ViewContext, role: "admin" | "volunteer", shared: PublicView = publicView(state, ctx)): StaffView {
  const { kind: _kind, ...rest } = shared;
  const isAdmin = role === "admin";
  return {
    ...rest,
    standings: ctx.standings,
    kind: "staff",
    role,
    staff: {
      teams: state.teams,
      subs: state.subs,
      hints: state.hints,
      ledgers: ctx.ledgers,
      allStandings: ctx.standings,
      adjustments: state.adjustments,
      presence: ctx.presence,
      // The audit log mentions vault contents and content edits: admins only.
      audit: isAdmin ? state.audit : [],
      allBadges: ctx.badges,
    },
    full: isAdmin ? state : null,
  };
}
