// Answer forms for every round. Controlled and stateless, so the same
// forms serve the team console and the admin's paper-slip entry.

import type { PublicCase, PublicRounds } from "../../../shared/protocol";
import type { Call, FinaleSub, R1Sub, R2Sub, R3Sub, R4Sub, RoundId, SubData } from "../../../shared/types";
import { credits } from "../../lib/format";
import { EvidenceCard } from "../Evidence";
import { HexCoin } from "../ui";

export const EMPTY_SUB: { [K in RoundId]: SubData[K] } = {
  r1: { stakes: {} },
  r2: { answers: {} },
  r3: { calls: {} },
  r4: { choice: "bank", door: "", wager: 0 },
  finale: { thiefId: "", locationId: "", methodId: "", bet: 0 },
};

interface Common {
  disabled: boolean;
  budget: number;
  caseFile: PublicCase;
}

// ---------------------------------------------------------------- shared bits

function Stepper({ value, onChange, step, max, disabled, label }: { value: number; onChange: (n: number) => void; step: number; max: number; disabled: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className="keycap size-10 p-0 text-lg" disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - step))} aria-label={`Less on ${label}`}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="field w-20 px-2 py-2 text-center font-mono font-bold"
        value={value || ""}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        aria-label={`Credits on ${label}`}
      />
      <button type="button" className="keycap keycap-honey size-10 p-0 text-lg" disabled={disabled || value + step > max} onClick={() => onChange(value + step)} aria-label={`More on ${label}`}>
        +
      </button>
    </div>
  );
}

function Meter({ used, limit, label }: { used: number; limit: number; label: string }) {
  const over = used > limit;
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className={`font-mono font-bold ${over ? "text-alarm" : "text-honey"}`}>
          {credits(used)} / {credits(limit)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full transition-all ${over ? "bg-alarm" : "bg-honey"}`} style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
      </div>
      {over && <p className="mt-2 text-xs text-alarm">That's over the limit. Take some credits off before it can save.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- R1

export function r1Limit(round: PublicRounds["r1"], budget: number): number {
  return Math.max(0, Math.min(round.maxStake, budget));
}

export function R1Form({ round, value, onChange, disabled, budget }: Common & { round: PublicRounds["r1"]; value: R1Sub; onChange: (v: R1Sub) => void }) {
  const leads = round.leads ?? [];
  const used = Object.values(value.stakes).reduce((a, b) => a + b, 0);
  const limit = r1Limit(round, budget);
  const revealed = leads.some((l) => l.real !== undefined);
  return (
    <div className="space-y-3">
      {!revealed && <Meter used={used} limit={limit} label="Credits staked" />}
      {leads.map((lead, index) => {
        const stake = value.stakes[lead.id] ?? 0;
        const result = lead.real === undefined ? null : lead.real;
        const payout = result === null || !stake ? null : result ? Math.round(stake * (lead.odds - 1)) : -stake;
        return (
          <div key={lead.id} className={`panel overflow-hidden p-4 ${result === true ? "border-acid/50" : result === false ? "border-alarm/40 opacity-80" : ""}`}>
            <div className="flex items-start gap-3">
              <span className="font-mono text-xs text-dim">L{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="label text-ice">{lead.source}</p>
                <p className="mt-1 leading-snug">{lead.text}</p>
              </div>
              <span className="shrink-0 rounded-lg border border-honey/40 bg-honey/10 px-2 py-1 font-mono text-sm font-bold text-honey">×{lead.odds}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              {result === null ? (
                <Stepper value={stake} max={limit - used + stake} step={50} disabled={disabled} onChange={(n) => onChange({ stakes: { ...value.stakes, [lead.id]: n } })} label={`lead ${index + 1}`} />
              ) : (
                <span className={`stamp text-sm ${result ? "text-acid" : "text-alarm"}`}>{result ? "Real" : "Rumour"}</span>
              )}
              {result !== null && (
                <span className="text-right font-mono text-sm">
                  {stake ? <>staked {credits(stake)} → <b className={payout! >= 0 ? "text-acid" : "text-alarm"}>{payout! >= 0 ? "+" : "−"}{credits(Math.abs(payout!))}</b></> : <span className="text-dim">no stake</span>}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {!disabled && used > 0 && (
        <button type="button" className="keycap text-xs" onClick={() => onChange({ stakes: {} })}>
          Clear all stakes
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- R2

export function R2Form({ round, value, onChange, disabled }: Common & { round: PublicRounds["r2"]; value: R2Sub; onChange: (v: R2Sub) => void }) {
  return (
    <div className="space-y-4">
      {(round.questions ?? []).map((q, index) => {
        const answer = value.answers[q.id] ?? "";
        const accepted = q.answers;
        const right = accepted ? accepted.some((a) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === answer.toLowerCase().replace(/[^a-z0-9]/g, "") && answer) : null;
        return (
          <label key={q.id} className="block">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                <span className="mr-2 font-mono text-honey">Q{index + 1}</span>
                {q.prompt}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted">+{q.points}</span>
            </span>
            <input
              className={`field mt-2 font-mono text-lg ${right === true ? "border-acid" : right === false ? "border-alarm" : ""}`}
              value={answer}
              placeholder={q.placeholder}
              disabled={disabled}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={120}
              onChange={(e) => onChange({ answers: { ...value.answers, [q.id]: e.target.value } })}
            />
            {accepted && (
              <span className={`mt-1 block text-sm ${right ? "text-acid" : "text-alarm"}`}>
                {right ? "✓ Correct" : `✗ Answer: ${accepted[0]}`}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- R3

export function R3Form({ round, value, onChange, disabled, caseFile }: Common & { round: PublicRounds["r3"]; value: R3Sub; onChange: (v: R3Sub) => void }) {
  const suspects = new Map(caseFile.suspects.map((s) => [s.id, s]));
  const set = (id: string, call: Call) => {
    const calls = { ...value.calls };
    if (calls[id] === call) delete calls[id];
    else calls[id] = call;
    onChange({ calls });
  };
  return (
    <div className="space-y-5">
      {(round.items ?? []).map((item, index) => {
        const call = value.calls[item.id];
        const verdict = item.fake === undefined || !call ? null : (call === "fake") === item.fake;
        return (
          <div key={item.id}>
            <EvidenceCard item={item} index={index} suspect={suspects.get(item.suspectId)} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["real", "fake"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  aria-pressed={call === option}
                  onClick={() => set(item.id, option)}
                  className={`keycap w-full text-sm ${call === option ? (option === "real" ? "keycap-acid" : "keycap-alarm") : ""}`}
                >
                  {option === "real" ? "✓ Real" : "✗ AI fake"}
                </button>
              ))}
            </div>
            {verdict !== null && (
              <p className={`mt-1.5 text-center font-mono text-sm font-bold ${verdict ? "text-acid" : "text-alarm"}`}>
                {verdict ? `Correct call +${round.pointsCorrect}` : `Wrong call −${round.pointsWrong}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- R4

export function vaultCap(round: PublicRounds["r4"], budget: number): number {
  return Math.floor((Math.max(0, budget) * round.maxWagerPct) / 100);
}

export function R4Form({ round, value, onChange, disabled, budget }: Common & { round: PublicRounds["r4"]; value: R4Sub; onChange: (v: R4Sub) => void }) {
  const cap = vaultCap(round, budget);
  const canVault = cap >= round.minWager;
  const wager = Math.min(Math.max(value.wager, round.minWager), cap);
  const pick = (choice: R4Sub["choice"]) =>
    onChange(choice === "bank" ? { choice, door: "", wager: 0 } : { choice, door: value.door, wager: value.wager >= round.minWager ? Math.min(value.wager, cap) : round.minWager });
  const fill = cap > round.minWager ? ((wager - round.minWager) / (cap - round.minWager)) * 100 : 100;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={disabled} onClick={() => pick("bank")} aria-pressed={value.choice === "bank"} className={`rounded-2xl border-2 p-4 text-left transition ${value.choice === "bank" ? "border-acid bg-acid/10" : "border-line bg-panel"}`}>
          <span className="text-3xl">🏦</span>
          <p className="mt-2 font-display font-bold">Bank it</p>
          <p className="text-xs text-muted">Keep every credit. No bonus clue.</p>
        </button>
        <button type="button" disabled={disabled || !canVault} onClick={() => pick("vault")} aria-pressed={value.choice === "vault"} className={`rounded-2xl border-2 p-4 text-left transition disabled:opacity-50 ${value.choice === "vault" ? "border-alarm bg-alarm/10" : "border-line bg-panel"}`}>
          <span className="text-3xl">🔐</span>
          <p className="mt-2 font-display font-bold">Crack it</p>
          <p className="text-xs text-muted">{canVault ? `Wager ${credits(round.minWager)}–${credits(cap)}.` : "Not enough credits to play."}</p>
        </button>
      </div>

      {value.choice === "vault" && (
        <>
          <div>
            <p className="label mb-2">Pick a door</p>
            <div className="grid grid-cols-3 gap-2">
              {round.doors.map((door) => (
                <button
                  key={door}
                  type="button"
                  disabled={disabled}
                  aria-pressed={value.door === door}
                  onClick={() => onChange({ ...value, door, wager })}
                  className={`relative grid aspect-[5/4] place-items-center rounded-xl border-2 font-display text-3xl font-black transition ${
                    value.door === door ? "border-honey bg-honey text-ink shadow-[0_0_30px] shadow-honey/40" : "border-line-2 bg-panel-2 text-paper"
                  }`}
                >
                  {door}
                  <span className={`absolute right-2 bottom-2 size-3 rounded-full border-2 ${value.door === door ? "border-ink" : "border-line-2"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="panel p-4">
            <div className="flex items-baseline justify-between">
              <span className="label">Your wager</span>
              <span className="flex items-center gap-1.5 font-mono text-2xl font-bold text-honey">
                <HexCoin />
                {credits(wager)}
              </span>
            </div>
            <input
              type="range"
              className="range mt-4"
              min={round.minWager}
              max={Math.max(round.minWager, cap)}
              step={10}
              value={wager}
              disabled={disabled}
              style={{ "--fill": `${fill}%` } as React.CSSProperties}
              onChange={(e) => onChange({ ...value, wager: Number(e.target.value) })}
              aria-label="Wager"
            />
            <div className="mt-3 flex gap-2">
              {[0.25, 0.5, 1].map((share) => (
                <button key={share} type="button" className="keycap flex-1 text-xs" disabled={disabled} onClick={() => onChange({ ...value, wager: Math.max(round.minWager, Math.floor((cap * share) / 10) * 10) })}>
                  {share === 1 ? "Max" : `${share * 100}%`}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <PrizeTable round={round} />
    </div>
  );
}

export function PrizeTable({ round }: { round: PublicRounds["r4"] }) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <p className="label mb-2">Behind the doors</p>
      <ul className="space-y-1.5 text-sm">
        {round.prizes.map((prize) => (
          <li key={prize.label} className="flex items-center gap-2">
            <span className="text-lg">{prize.emoji}</span>
            <span className="font-semibold">{prize.count}× {prize.label}</span>
            <span className="text-muted">{prize.clue ? "+ bonus clue" : ""}</span>
            <span className="ml-auto font-mono font-bold">×{prize.multiplier}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- finale

function Choice<T extends { id: string; name: string; emoji: string }>({ title, options, value, onPick, disabled, truth, sub, wide = false }: { title: string; options: T[]; value: string; onPick: (id: string) => void; disabled: boolean; truth?: string; sub?: (o: T) => string; wide?: boolean }) {
  return (
    <fieldset>
      <legend className="label mb-2">{title}</legend>
      <div className={`grid gap-2 ${wide ? "grid-cols-1" : "grid-cols-2"}`}>
        {options.map((option) => {
          const chosen = value === option.id;
          const isTruth = truth === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={chosen}
              onClick={() => onPick(option.id)}
              className={`relative flex items-center gap-2 rounded-xl border-2 p-3 text-left text-sm transition ${
                isTruth ? "border-acid bg-acid/10" : chosen ? "border-honey bg-honey/10" : "border-line bg-panel"
              } ${truth && chosen && !isTruth ? "border-alarm bg-alarm/10" : ""}`}
            >
              <span className="text-2xl">{option.emoji}</span>
              <span className="min-w-0">
                <span className="block leading-snug font-semibold">{option.name}</span>
                {sub && <span className="block text-xs text-muted">{sub(option)}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FinaleForm({ round, value, onChange, disabled, budget, caseFile }: Common & { round: PublicRounds["finale"]; value: FinaleSub; onChange: (v: FinaleSub) => void }) {
  const bet = Math.min(value.bet, budget);
  const truth = caseFile.solution;
  const fill = budget > 0 ? (bet / budget) * 100 : 0;
  return (
    <div className="space-y-6">
      <Choice title="Who stole it?" options={caseFile.suspects} value={value.thiefId} onPick={(thiefId) => onChange({ ...value, thiefId })} disabled={disabled} truth={truth.thiefId} sub={(s) => `“${s.alias}”`} />
      <Choice title="Where is it hidden?" options={caseFile.locations} value={value.locationId} onPick={(locationId) => onChange({ ...value, locationId })} disabled={disabled} truth={truth.locationId} />
      <Choice title="How do we get it back?" options={caseFile.methods} value={value.methodId} onPick={(methodId) => onChange({ ...value, methodId })} disabled={disabled} truth={truth.methodId} sub={(m) => m.detail} wide />
      <div className="panel p-4">
        <div className="flex items-baseline justify-between">
          <span className="label">Your bet</span>
          <span className="flex items-center gap-1.5 font-mono text-2xl font-bold text-honey">
            <HexCoin />
            {credits(bet)}
          </span>
        </div>
        <input
          type="range"
          className="range mt-4"
          min={0}
          max={Math.max(0, budget)}
          step={10}
          value={bet}
          disabled={disabled}
          style={{ "--fill": `${fill}%` } as React.CSSProperties}
          onChange={(e) => onChange({ ...value, bet: Number(e.target.value) })}
          aria-label="Final bet"
        />
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {[0, 0.25, 0.5, 0.75, 1].map((share) => (
            <button key={share} type="button" disabled={disabled} className={`keycap px-1 text-[11px] ${share === 1 ? "keycap-alarm" : ""}`} onClick={() => onChange({ ...value, bet: Math.floor((budget * share) / 10) * 10 })}>
              {share === 1 ? "ALL IN" : `${share * 100}%`}
            </button>
          ))}
        </div>
        <ul className="mt-4 space-y-1 font-mono text-xs text-muted">
          <li>3/3 right → bet ×{round.payout.three} <span className="text-acid">(+{credits(bet * (round.payout.three - 1))})</span></li>
          <li>2/3 right → bet ×{round.payout.two}</li>
          <li>1/3 or 0/3 → bet ×{round.payout.one} <span className="text-alarm">(−{credits(bet * (1 - round.payout.one))})</span></li>
        </ul>
      </div>
    </div>
  );
}

/** Whether a draft is complete enough to be worth locking in. */
export function isComplete<K extends RoundId>(roundId: K, data: SubData[K], rounds: PublicRounds): boolean {
  switch (roundId) {
    case "r1":
      return Object.values((data as R1Sub).stakes).some((v) => v > 0);
    case "r2":
      return (rounds.r2.questions ?? []).every((q) => ((data as R2Sub).answers[q.id] ?? "").trim());
    case "r3":
      return (rounds.r3.items ?? []).every((i) => (data as R3Sub).calls[i.id]);
    case "r4": {
      const d = data as R4Sub;
      return d.choice === "bank" || Boolean(d.door);
    }
    case "finale": {
      const d = data as FinaleSub;
      return Boolean(d.thiefId && d.locationId && d.methodId);
    }
  }
  return false;
}
