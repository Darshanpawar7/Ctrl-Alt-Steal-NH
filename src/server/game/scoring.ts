// Scoring. Credits are never stored: they are recomputed from submissions,
// answer keys and manual adjustments every time. Fixing any of those inputs
// fixes every total that depends on it, which is what makes admin
// corrections safe.

import {
  REVEAL_STEP,
  ROUND_IDS,
  type Badge,
  type GameState,
  type LedgerRow,
  type RoundId,
  type Standing,
  type TeamLedger,
} from "../../shared/types";
import { clamp, isCorrectAnswer, sum } from "./util";

// ---------------------------------------------------------------- per round

function scoreR1(state: GameState, teamId: string, budget: number): LedgerRow[] {
  const sub = state.subs.r1[teamId];
  if (state.status.r1 !== "revealed" || !sub) return [];
  const cfg = state.rounds.r1;
  const stakes = cfg.leads.map((lead) => ({ lead, stake: Math.max(0, Math.floor(sub.data.stakes[lead.id] ?? 0)) }));
  const total = sum(stakes.map((s) => s.stake));
  const limit = Math.max(0, Math.min(cfg.maxStake, budget));
  // If a later correction pushed stakes over the limit, scale them down evenly.
  const factor = total > limit && total > 0 ? limit / total : 1;
  const rows: LedgerRow[] = [];
  stakes.forEach(({ lead, stake: raw }, index) => {
    const stake = Math.floor(raw * factor);
    if (stake <= 0) return;
    const delta = lead.real ? Math.round(stake * (lead.odds - 1)) : -stake;
    rows.push({
      key: `r1:${lead.id}`,
      roundId: "r1",
      label: `Lead ${index + 1}`,
      delta,
      detail: lead.real ? `Real lead. ${stake} staked at ×${lead.odds}` : `Rumour. Lost the ${stake} staked`,
    });
  });
  return rows;
}

/** Order in which teams locked in a fully correct Round 2 answer. */
export function r2SpeedOrder(state: GameState): string[] {
  const questions = state.rounds.r2.questions;
  const eligible = new Set(state.teams.filter((t) => !t.disqualified).map((t) => t.id));
  return Object.entries(state.subs.r2)
    .filter(([teamId, sub]) => {
      if (!eligible.has(teamId) || sub.lockedAt === null) return false;
      return questions.every((q) => isCorrectAnswer(sub.data.answers[q.id], q.answers));
    })
    .sort((a, b) => a[1].lockedAt! - b[1].lockedAt!)
    .map(([teamId]) => teamId);
}

function hintRows(state: GameState, roundId: RoundId, teamId: string): LedgerRow[] {
  const bought = state.hints[roundId][teamId] ?? [];
  const hints = state.rounds[roundId].hints;
  return [...new Set(bought)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < hints.length)
    .map((index) => ({
      key: `${roundId}:hint:${index}`,
      roundId,
      label: `Hint ${index + 1}`,
      delta: -hints[index]!.cost,
      detail: "Bought a hint",
    }));
}

function scoreR2(state: GameState, teamId: string, speedOrder: string[]): LedgerRow[] {
  const sub = state.subs.r2[teamId];
  if (state.status.r2 !== "revealed" || !sub) return [];
  const cfg = state.rounds.r2;
  const rows: LedgerRow[] = cfg.questions.map((q, index) => {
    const correct = isCorrectAnswer(sub.data.answers[q.id], q.answers);
    return {
      key: `r2:${q.id}`,
      roundId: "r2",
      label: `Question ${index + 1}`,
      delta: correct ? q.points : 0,
      detail: correct ? "Correct" : `Wrong (answered “${sub.data.answers[q.id] ?? ""}”)`,
    };
  });
  const place = speedOrder.indexOf(teamId);
  const bonus = place >= 0 ? cfg.speedBonus[place] : undefined;
  if (bonus) {
    rows.push({ key: "r2:speed", roundId: "r2", label: "Speed bonus", delta: bonus, detail: `#${place + 1} to lock in all correct` });
  }
  return rows;
}

function scoreR3(state: GameState, teamId: string): LedgerRow[] {
  const sub = state.subs.r3[teamId];
  if (state.status.r3 !== "revealed" || !sub) return [];
  const cfg = state.rounds.r3;
  let right = 0;
  let wrong = 0;
  for (const item of cfg.items) {
    const call = sub.data.calls[item.id];
    if (!call) continue;
    if ((call === "fake") === item.fake) right++;
    else wrong++;
  }
  const rows: LedgerRow[] = [];
  if (right) rows.push({ key: "r3:right", roundId: "r3", label: "Correct calls", delta: right * cfg.pointsCorrect, detail: `${right} × ${cfg.pointsCorrect}` });
  if (wrong) rows.push({ key: "r3:wrong", roundId: "r3", label: "Wrong calls", delta: -wrong * cfg.pointsWrong, detail: `${wrong} × ${cfg.pointsWrong}` });
  return rows;
}

export function vaultCap(state: GameState, budget: number): number {
  return Math.floor((Math.max(0, budget) * state.rounds.r4.maxWagerPct) / 100);
}

/**
 * A crew's vault play, or null if it effectively banked. A pick only counts
 * with a real wager, so nobody wins the bonus clue while risking nothing.
 */
export function vaultPlay(state: GameState, teamId: string, budget: number): { door: string; wager: number } | null {
  const sub = state.subs.r4[teamId];
  if (!sub || sub.data.choice !== "vault" || !state.rounds.r4.doors.includes(sub.data.door)) return null;
  const wager = clamp(Math.floor(sub.data.wager), 0, vaultCap(state, budget));
  return wager >= state.rounds.r4.minWager && wager > 0 ? { door: sub.data.door, wager } : null;
}

function scoreR4(state: GameState, teamId: string, budget: number): LedgerRow[] {
  if (state.status.r4 !== "revealed") return [];
  const play = vaultPlay(state, teamId, budget);
  if (!play) return [{ key: "r4:bank", roundId: "r4", label: "Banked", delta: 0, detail: "Played it safe" }];
  const { door, wager } = play;
  const prize = state.rounds.r4.prizes[state.vault[door] ?? -1];
  if (!state.live.vaultOpened.includes(door) || !prize) {
    return [{ key: "r4:door", roundId: "r4", label: `Door ${door}`, delta: 0, detail: "Waiting for the door to open", pending: true }];
  }
  const delta = Math.round(wager * (prize.multiplier - 1));
  return [{ key: "r4:door", roundId: "r4", label: `Door ${door}: ${prize.label}`, delta, detail: `${wager} wagered, came back ×${prize.multiplier}` }];
}

export function finaleScored(state: GameState): boolean {
  return state.status.finale === "revealed" && state.live.revealStep >= REVEAL_STEP.method;
}

export function finaleCorrectCount(state: GameState, teamId: string): number {
  const sub = state.subs.finale[teamId];
  if (!sub) return 0;
  const { solution } = state.caseFile;
  return (
    Number(sub.data.thiefId === solution.thiefId) +
    Number(sub.data.locationId === solution.locationId) +
    Number(sub.data.methodId === solution.methodId)
  );
}

function scoreFinale(state: GameState, teamId: string, budget: number): LedgerRow[] {
  const sub = state.subs.finale[teamId];
  if (!finaleScored(state) || !sub) return [];
  const bet = clamp(Math.floor(sub.data.bet), 0, Math.max(0, budget));
  const correct = finaleCorrectCount(state, teamId);
  const { payout } = state.rounds.finale;
  const multiplier = [payout.zero, payout.one, payout.two, payout.three][correct]!;
  const delta = Math.round(bet * (multiplier - 1));
  return [{ key: "finale", roundId: "finale", label: `Final answer: ${correct}/3`, delta, detail: `${bet} bet, came back ×${multiplier}` }];
}

// ---------------------------------------------------------------- ledgers

/** `budget` is what the crew can stake this round: its credits after any hints bought in it. */
function scoreRound(state: GameState, roundId: RoundId, teamId: string, budget: number, speedOrder: string[]): LedgerRow[] {
  switch (roundId) {
    case "r1":
      return scoreR1(state, teamId, budget);
    case "r2":
      return scoreR2(state, teamId, speedOrder);
    case "r3":
      return scoreR3(state, teamId);
    case "r4":
      return scoreR4(state, teamId, budget);
    case "finale":
      return scoreFinale(state, teamId, budget);
  }
}

function isScored(state: GameState, roundId: RoundId): boolean {
  return roundId === "finale" ? finaleScored(state) : state.status[roundId] === "revealed";
}

/** Ledgers for every team, or just one when `onlyTeamId` is given (cheaper for budget checks). */
export function computeLedgers(state: GameState, onlyTeamId?: string): Record<string, TeamLedger> {
  const speedOrder = r2SpeedOrder(state);
  const start = state.event.startingCredits;
  const out: Record<string, TeamLedger> = {};
  const teams = onlyTeamId ? state.teams.filter((t) => t.id === onlyTeamId) : state.teams;

  for (const team of teams) {
    const adjustments = state.adjustments.filter((a) => a.teamId === team.id);
    const adjustmentRows = (after: RoundId | null): LedgerRow[] =>
      adjustments
        .filter((a) => a.afterRound === after)
        .map((a) => ({ key: `adj:${a.id}`, roundId: after, label: "Adjustment", delta: a.amount, detail: a.reason }));

    const rows: LedgerRow[] = [{ key: "start", roundId: null, label: "Starting credits", delta: start, detail: "" }];
    rows.push(...adjustmentRows(null));
    let credits = sum(rows.map((r) => r.delta));
    const after: TeamLedger["after"] = { start: credits };
    const before = {} as Record<RoundId, number>;

    for (const roundId of ROUND_IDS) {
      const hints = hintRows(state, roundId, team.id);
      before[roundId] = credits + sum(hints.map((r) => r.delta));
      const roundRows = [...hints, ...scoreRound(state, roundId, team.id, before[roundId], speedOrder), ...adjustmentRows(roundId)];
      rows.push(...roundRows);
      credits += sum(roundRows.map((r) => r.delta));
      if (isScored(state, roundId)) after[roundId] = credits;
    }
    out[team.id] = { teamId: team.id, rows, total: credits, after, before };
  }
  return out;
}

/** Teams that belong on the leaderboard: present (if check-in is required) and not disqualified. */
export function rankedTeamIds(state: GameState): string[] {
  return state.teams
    .filter((t) => !t.disqualified && (t.checkedIn || !state.event.requireCheckIn))
    .map((t) => t.id);
}

function rankBy(ids: string[], creditsOf: (id: string) => number, nameOf: (id: string) => string): Map<string, number> {
  const sorted = [...ids].sort((a, b) => creditsOf(b) - creditsOf(a) || nameOf(a).localeCompare(nameOf(b)));
  const ranks = new Map<string, number>();
  sorted.forEach((id, index) => {
    const prev = sorted[index - 1];
    ranks.set(id, prev !== undefined && creditsOf(prev) === creditsOf(id) ? ranks.get(prev)! : index + 1);
  });
  return ranks;
}

/** Leaderboard, with each team's rank before the most recent scored round. */
export function computeStandings(state: GameState, ledgers: Record<string, TeamLedger>): Standing[] {
  const ids = rankedTeamIds(state);
  const names = new Map(state.teams.map((t) => [t.id, t.name]));
  const nameOf = (id: string) => names.get(id) ?? "";
  const scored: (RoundId | "start")[] = ["start", ...ROUND_IDS.filter((r) => isScored(state, r))];
  const previous = scored.length >= 2 ? scored[scored.length - 2]! : null;

  const now = rankBy(ids, (id) => ledgers[id]?.total ?? 0, nameOf);
  const before = previous ? rankBy(ids, (id) => creditsAt(ledgers[id], previous), nameOf) : null;

  return ids
    .map((id) => ({ teamId: id, credits: ledgers[id]?.total ?? 0, rank: now.get(id)!, prevRank: before?.get(id) ?? null }))
    .sort((a, b) => a.rank - b.rank || nameOf(a.teamId).localeCompare(nameOf(b.teamId)));
}

function creditsAt(ledger: TeamLedger | undefined, checkpoint: RoundId | "start"): number {
  if (!ledger) return 0;
  const order: (RoundId | "start")[] = ["start", ...ROUND_IDS];
  for (let i = order.indexOf(checkpoint); i >= 0; i--) {
    const value = ledger.after[order[i]!];
    if (value !== undefined) return value;
  }
  return ledger.total;
}

// ---------------------------------------------------------------- badges

export function computeBadges(state: GameState, ledgers: Record<string, TeamLedger>): Record<string, Badge[]> {
  const out: Record<string, Badge[]> = {};
  const speedOrder = r2SpeedOrder(state);
  const ranked = rankedTeamIds(state);
  const afterR3 = rankBy(ranked, (id) => creditsAt(ledgers[id], "r3"), () => "");
  const final = rankBy(ranked, (id) => ledgers[id]?.total ?? 0, () => "");

  for (const team of state.teams) {
    const id = team.id;
    const ledger = ledgers[id];
    if (!ledger) continue;
    const badges: Badge[] = [];
    const add = (badgeId: string, emoji: string, name: string, why: string) => badges.push({ id: badgeId, emoji, name, why });

    const r1 = state.subs.r1[id];
    if (state.status.r1 === "revealed" && r1) {
      const staked = state.rounds.r1.leads.filter((l) => (r1.data.stakes[l.id] ?? 0) > 0);
      const total = sum(staked.map((l) => r1.data.stakes[l.id] ?? 0));
      if (staked.length && staked.every((l) => l.real) && total >= state.rounds.r1.maxStake / 2) {
        add("oracle", "🔮", "Oracle", "Backed only real leads on the Trading Floor");
      }
    }
    if (state.status.r2 === "revealed") {
      if (speedOrder[0] === id) add("speed", "⚡", "Speed Demon", "First to crack the Training Log");
      const r2 = state.subs.r2[id];
      const allRight = r2 && state.rounds.r2.questions.every((q) => isCorrectAnswer(r2.data.answers[q.id], q.answers));
      if (allRight && !(state.hints.r2[id]?.length)) add("codebreaker", "🧠", "Codebreaker", "Cracked the log without a single hint");
    }
    const r3 = state.subs.r3[id];
    if (state.status.r3 === "revealed" && r3) {
      const items = state.rounds.r3.items;
      if (items.length && items.every((item) => (r3.data.calls[item.id] === "fake") === item.fake && r3.data.calls[item.id])) {
        add("hunter", "🕵️", "Deepfake Hunter", "Called every piece of evidence correctly");
      }
    }
    if (state.status.r4 === "revealed") {
      const play = vaultPlay(state, id, ledger.before.r4);
      if (!play) add("banker", "🏦", "Safe Hands", "Banked it in the Vault");
      else if (state.live.vaultOpened.includes(play.door)) {
        const prize = state.rounds.r4.prizes[state.vault[play.door] ?? -1];
        if (prize && prize.multiplier === Math.max(...state.rounds.r4.prizes.map((p) => p.multiplier))) {
          add("jackpot", "💰", "Jackpot", "Opened the jackpot door");
        }
        if (play.wager >= vaultCap(state, ledger.before.r4) * 0.9) add("highroller", "🎰", "High Roller", "Wagered the maximum in the Vault");
      }
    }
    if (finaleScored(state) && state.subs.finale[id]) {
      if (finaleCorrectCount(state, id) === 3) add("mastermind", "🏆", "Mastermind", "Named the thief, the place and the method");
      if (state.subs.finale[id]!.data.bet >= ledger.before.finale * 0.9 && ledger.before.finale > 0) {
        add("diamond", "💎", "Diamond Hands", "Bet (almost) everything on the final answer");
      }
      const was = afterR3.get(id);
      const is = final.get(id);
      if (was !== undefined && is !== undefined && was - is >= 3) add("comeback", "🚀", "Comeback Crew", `Climbed ${was - is} places after the Lineup`);
    }
    out[id] = badges;
  }
  return out;
}
