import { Fragment, useState, type FormEvent } from "react";
import { ROUND_IDS, type RoundId } from "../../../shared/types";
import { ConfirmButton, Delta, SectionLabel } from "../../components/ui";
import { ROUND_LABEL, credits, downloadFile, timeOfDay, toCsv } from "../../lib/format";
import { useStaff } from "./context";

export default function Scores() {
  const { view, act, isAdmin } = useStaff();
  const [open, setOpen] = useState<string | null>(null);
  const teams = new Map(view.staff.teams.map((t) => [t.id, t]));
  const standings = view.staff.allStandings;
  const unranked = view.staff.teams.filter((t) => !standings.some((s) => s.teamId === t.id));

  const roundDelta = (teamId: string, roundId: RoundId | null, adjustmentsOnly = false) =>
    (view.staff.ledgers[teamId]?.rows ?? [])
      .filter((r) => (adjustmentsOnly ? r.key.startsWith("adj:") : r.roundId === roundId && !r.key.startsWith("adj:") && r.key !== "start"))
      .reduce((a, r) => a + r.delta, 0);

  function exportCsv() {
    const rows: (string | number)[][] = [["Rank", "Team", "Start", ...ROUND_IDS.map((id) => ROUND_LABEL[id]), "Adjustments", "Total"]];
    for (const s of standings) {
      rows.push([s.rank, teams.get(s.teamId)?.name ?? "", view.event.startingCredits, ...ROUND_IDS.map((id) => roundDelta(s.teamId, id)), roundDelta(s.teamId, null, true), s.credits]);
    }
    downloadFile(`scores-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black">Scores & fixes</h1>
          <p className="text-muted">Totals are recalculated from answers every time, so fixing an answer or the key fixes the score. Use adjustments for anything else.</p>
        </div>
        <button type="button" className="keycap text-sm" onClick={exportCsv}>
          ⬇ Scores CSV
        </button>
      </header>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-panel-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Crew</th>
              {ROUND_IDS.map((id) => (
                <th key={id} className="px-3 py-2 text-right">
                  {ROUND_LABEL[id]}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Adj.</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {standings.map((s) => {
              const team = teams.get(s.teamId);
              const ledger = view.staff.ledgers[s.teamId];
              return (
                <Fragment key={s.teamId}>
                  <tr className="cursor-pointer hover:bg-panel-2" onClick={() => setOpen(open === s.teamId ? null : s.teamId)}>
                    <td className="px-3 py-2.5 font-display font-bold">{s.rank}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {team?.emoji} {team?.name} <span className="text-xs text-dim">{open === s.teamId ? "▲" : "▼"}</span>
                    </td>
                    {ROUND_IDS.map((id) => (
                      <td key={id} className="px-3 py-2.5 text-right">
                        <Delta value={roundDelta(s.teamId, id)} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right">
                      <Delta value={roundDelta(s.teamId, null, true)} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-honey">{credits(s.credits)}</td>
                  </tr>
                  {open === s.teamId && ledger && (
                    <tr className="bg-ink-2">
                      <td colSpan={ROUND_IDS.length + 4} className="px-6 py-4">
                        <ul className="space-y-1 font-mono text-xs">
                          {ledger.rows.map((r) => (
                            <li key={r.key} className="flex gap-4">
                              <span className="w-20 text-dim">{r.roundId ? ROUND_LABEL[r.roundId] : "Start"}</span>
                              <span className="w-40">{r.label}</span>
                              <span className="flex-1 text-muted">
                                {r.detail}
                                {r.pending ? " (pending)" : ""}
                              </span>
                              <Delta value={r.delta} />
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {unranked.length > 0 && (
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            Not on the board (absent or disqualified): {unranked.map((t) => t.name).join(", ")}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {isAdmin && <AdjustForm />}
        <div className="panel p-5">
          <SectionLabel>Adjustments so far</SectionLabel>
          <ul className="mt-3 space-y-2">
            {view.staff.adjustments.length === 0 && <li className="text-sm text-muted">None yet.</li>}
            {[...view.staff.adjustments].reverse().map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm">
                <Delta value={a.amount} className="w-20" />
                <span className="min-w-0 flex-1">
                  <b>{teams.get(a.teamId)?.name ?? "?"}</b> · {a.reason}
                  <span className="block text-xs text-muted">
                    after {a.afterRound ? ROUND_LABEL[a.afterRound] : "start"} · {timeOfDay(a.at)} · {a.by}
                  </span>
                </span>
                {isAdmin && (
                  <ConfirmButton className="keycap text-xs" confirmLabel="Remove?" onConfirm={() => void act({ type: "adj.remove", id: a.id })}>
                    ✕
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AdjustForm() {
  const { view, act } = useStaff();
  const [teamId, setTeamId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const lastRevealed = [...ROUND_IDS].reverse().find((id) => view.status[id] === "revealed") ?? null;
  const [afterRound, setAfterRound] = useState<RoundId | "">(lastRevealed ?? "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await act({ type: "adj.add", teamId, amount: Math.round(Number(amount)), reason, afterRound: afterRound || null });
    if (ok) {
      setAmount("");
      setReason("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-3 p-5">
      <SectionLabel>Add or remove credits</SectionLabel>
      <select className="field" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
        <option value="">Choose a crew…</option>
        {view.staff.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.emoji} {t.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input className="field font-mono" inputMode="numeric" placeholder="+100 or -50" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <select className="field" value={afterRound} onChange={(e) => setAfterRound(e.target.value as RoundId | "")}>
          <option value="">Counts from the start</option>
          {ROUND_IDS.map((id) => (
            <option key={id} value={id}>
              Counts after {ROUND_LABEL[id]}
            </option>
          ))}
        </select>
      </div>
      <input className="field" placeholder="Reason (required, shows in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
      <p className="text-xs text-muted">“Counts after” matters for later caps: credits added after Round 3 raise that crew's Vault wager limit.</p>
      <button type="submit" className="keycap keycap-honey text-sm">
        Apply adjustment
      </button>
    </form>
  );
}
