import { useState } from "react";
import type { StaffView } from "../../../shared/protocol";
import { ROUND_IDS, type FinaleSub, type R1Sub, type R2Sub, type R3Sub, type R4Sub, type RoundId, type RoundStatus, type SubData, type Team } from "../../../shared/types";
import { EMPTY_SUB, FinaleForm, R1Form, R2Form, R3Form, R4Form } from "../../components/rounds/forms";
import { ConfirmButton, Delta, Modal, SectionLabel } from "../../components/ui";
import { ROUND_LABEL, credits, timeOfDay } from "../../lib/format";
import { useStaff } from "./context";

const STATUS_FLOW: { status: RoundStatus; label: string }[] = [
  { status: "pending", label: "Hidden" },
  { status: "intro", label: "Explain" },
  { status: "open", label: "GO (start timer)" },
  { status: "locked", label: "Lock" },
  { status: "revealed", label: "Reveal & pay out" },
];

export default function Rounds() {
  const { view } = useStaff();
  const [roundId, setRoundId] = useState<RoundId>(view.live.roundId ?? "r1");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-black">Rounds & answers</h1>
        <p className="text-muted">Every crew's answer, who entered it, and what it scored. Type in paper slips here if the Wi-Fi fails.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {ROUND_IDS.map((id) => (
          <button key={id} type="button" className={`keycap text-sm ${roundId === id ? "keycap-honey" : ""}`} onClick={() => setRoundId(id)}>
            {ROUND_LABEL[id]} · {view.rounds[id].title}
            <span className="ml-1 text-[10px] opacity-70">({view.status[id]})</span>
          </button>
        ))}
      </div>
      <RoundDetail key={roundId} roundId={roundId} />
    </div>
  );
}

function RoundDetail({ roundId }: { roundId: RoundId }) {
  const { view, act, isAdmin } = useStaff();
  const [editing, setEditing] = useState<Team | null>(null);
  const status = view.status[roundId];
  const teams = view.staff.teams.filter((t) => t.checkedIn || view.staff.subs[roundId][t.id]);
  const subs = view.staff.subs[roundId];
  const done = teams.filter((t) => subs[t.id]).length;
  const canEdit = isAdmin || status !== "revealed";

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="panel flex flex-wrap items-center gap-2 p-4">
          <span className="label mr-2">Status</span>
          {STATUS_FLOW.map((s) => (
            <ConfirmButton
              key={s.status}
              className={`keycap text-xs ${status === s.status ? "keycap-honey" : ""}`}
              confirmLabel={`${s.label}?`}
              onConfirm={() => void act({ type: "round.set", roundId, status: s.status })}
            >
              {s.label}
            </ConfirmButton>
          ))}
        </div>
      )}

      {isAdmin && view.full && <AnswerKey roundId={roundId} />}

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <SectionLabel>
            Answers · {done}/{teams.length} crews
          </SectionLabel>
          {status === "revealed" && <span className="text-xs text-muted">{isAdmin ? "Edits after the reveal re-score instantly." : "Revealed. Ask a club head to correct answers now."}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-panel-2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Crew</th>
                <th className="px-4 py-2">Answer</th>
                <th className="px-4 py-2">Saved</th>
                {roundId !== "finale" && view.rounds[roundId].hintCosts.length > 0 && <th className="px-4 py-2">Hints</th>}
                <th className="px-4 py-2 text-right">Result</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {teams.map((team) => {
                const sub = subs[team.id];
                const rows = view.staff.ledgers[team.id]?.rows.filter((r) => r.roundId === roundId) ?? [];
                const delta = rows.reduce((a, r) => a + r.delta, 0);
                return (
                  <tr key={team.id} className={team.disqualified ? "opacity-50" : ""}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {team.emoji} <b>{team.name}</b>
                    </td>
                    <td className="max-w-[420px] px-4 py-3 text-paper/85">{sub ? summarize(view, roundId, sub.data) : <span className="text-alarm">— no answer —</span>}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                      {sub ? (
                        <>
                          {timeOfDay(sub.savedAt)} · {sub.by}
                          {sub.lockedAt && <span className="ml-1 text-honey">🔒 {timeOfDay(sub.lockedAt)}</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    {roundId !== "finale" && view.rounds[roundId].hintCosts.length > 0 && (
                      <td className="px-4 py-3">
                        <HintToggles roundId={roundId} team={team} />
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">{rows.length ? <Delta value={delta} /> : <span className="text-dim">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canEdit && (
                          <button type="button" className="keycap text-xs" onClick={() => setEditing(team)}>
                            {sub ? "Edit" : "Enter"}
                          </button>
                        )}
                        {isAdmin && sub?.lockedAt && (
                          <button type="button" className="keycap text-xs" onClick={() => act({ type: "sub.unlock", roundId, teamId: team.id })}>
                            Unlock
                          </button>
                        )}
                        {isAdmin && sub && (
                          <ConfirmButton className="keycap text-xs" confirmLabel="Clear?" onConfirm={() => void act({ type: "sub.clear", roundId, teamId: team.id })}>
                            ✕
                          </ConfirmButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? `${ROUND_LABEL[roundId]} · ${editing.emoji} ${editing.name}` : ""} wide>
        {editing && <SubEditor roundId={roundId} team={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function summarize(view: StaffView, roundId: RoundId, data: SubData[RoundId]): string {
  const c = view.caseFile;
  switch (roundId) {
    case "r1": {
      const stakes = Object.entries((data as R1Sub).stakes).filter(([, v]) => v > 0);
      const leads = view.rounds.r1.leads ?? view.full?.rounds.r1.leads ?? [];
      return stakes.length ? stakes.map(([id, v]) => `L${leads.findIndex((l) => l.id === id) + 1}: ${credits(v)}`).join(" · ") : "Nothing staked";
    }
    case "r2":
      return Object.values((data as R2Sub).answers).map((a) => a || "∅").join(" · ") || "Blank";
    case "r3": {
      const calls = (data as R3Sub).calls;
      const items = view.rounds.r3.items ?? view.full?.rounds.r3.items ?? [];
      return items.map((it, i) => `${i + 1}${calls[it.id] === "fake" ? "F" : calls[it.id] === "real" ? "R" : "·"}`).join(" ");
    }
    case "r4": {
      const d = data as R4Sub;
      return d.choice === "bank" || !d.door ? "🏦 Banked" : `Door ${d.door} · wager ${credits(d.wager)}`;
    }
    case "finale": {
      const d = data as FinaleSub;
      const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? "?";
      return `${name(c.suspects, d.thiefId)} · ${name(c.locations, d.locationId)} · ${name(c.methods, d.methodId)} · bet ${credits(d.bet)}`;
    }
  }
  return "";
}

function HintToggles({ roundId, team }: { roundId: RoundId; team: Team }) {
  const { view, act, isAdmin } = useStaff();
  const bought = view.staff.hints[roundId][team.id] ?? [];
  return (
    <div className="flex gap-1">
      {view.rounds[roundId].hintCosts.map((cost, index) => {
        const on = bought.includes(index);
        return (
          <button
            key={index}
            type="button"
            disabled={!isAdmin}
            title={`Hint ${index + 1} · ${cost} credits`}
            onClick={() => act({ type: "hint.set", roundId, teamId: team.id, indexes: on ? bought.filter((i) => i !== index) : [...bought, index] })}
            className={`grid size-7 place-items-center rounded-md border text-xs font-bold ${on ? "border-ice bg-ice/20 text-ice" : "border-line text-dim"}`}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}

function SubEditor({ roundId, team, onDone }: { roundId: RoundId; team: Team; onDone: () => void }) {
  const { view, act } = useStaff();
  const existing = view.staff.subs[roundId][team.id];
  const [draft, setDraft] = useState<SubData[RoundId]>(existing?.data ?? EMPTY_SUB[roundId]);
  const [lock, setLock] = useState(true);
  const budget = view.staff.ledgers[team.id]?.before[roundId] ?? 0;
  // Staff see the full round content even before it is shown to the room.
  const rounds = view.full
    ? {
        ...view.rounds,
        r1: { ...view.rounds.r1, leads: view.rounds.r1.leads ?? view.full.rounds.r1.leads.map(({ real: _r, ...l }) => l) },
        r2: { ...view.rounds.r2, questions: view.rounds.r2.questions ?? view.full.rounds.r2.questions.map(({ answers: _a, ...q }) => q) },
      }
    : view.rounds;
  const common = { disabled: false, budget, caseFile: view.caseFile };

  async function save() {
    if (await act({ type: "sub.staffSet", roundId, teamId: team.id, data: draft, lock })) onDone();
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
        Credits going into this round: <b className="text-honey">{credits(budget)}</b>. Limits are enforced when scoring, so an over-limit stake is scaled down automatically.
      </p>
      {roundId === "r1" && <R1Form {...common} round={rounds.r1} value={draft as R1Sub} onChange={setDraft} />}
      {roundId === "r2" && <R2Form {...common} round={rounds.r2} value={draft as R2Sub} onChange={setDraft} />}
      {roundId === "r3" && <R3Form {...common} round={view.rounds.r3} value={draft as R3Sub} onChange={setDraft} />}
      {roundId === "r4" && <R4Form {...common} round={view.rounds.r4} value={draft as R4Sub} onChange={setDraft} />}
      {roundId === "finale" && <FinaleForm {...common} round={view.rounds.finale} value={draft as FinaleSub} onChange={setDraft} />}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-honey" checked={lock} onChange={(e) => setLock(e.target.checked)} />
          Mark as locked in (the crew can't change it)
        </label>
        <div className="flex gap-2">
          <button type="button" className="keycap text-sm" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="keycap keycap-honey text-sm" onClick={save}>
            Save answer
          </button>
        </div>
      </div>
    </div>
  );
}

/** The private answer key for a round, with the controls that depend on it. */
function AnswerKey({ roundId }: { roundId: RoundId }) {
  const { view, act } = useStaff();
  const full = view.full!;
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="panel border-alarm/30 p-4">
      <summary className="flex items-center justify-between">
        <span className="label text-alarm">🔐 Answer key · keep this screen away from players</span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </summary>
      <div className="mt-4 text-sm">
        {roundId === "r1" && (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {full.rounds.r1.leads.map((l, i) => (
              <li key={l.id} className={l.real ? "text-acid" : "text-alarm"}>
                L{i + 1} ×{l.odds} — {l.real ? "REAL" : "rumour"}: {l.text}
              </li>
            ))}
          </ul>
        )}
        {roundId === "r2" && (
          <ul className="space-y-1">
            {full.rounds.r2.questions.map((q, i) => (
              <li key={q.id}>
                Q{i + 1}: <b className="text-acid">{q.answers.join(" / ")}</b> ({q.points})
              </li>
            ))}
          </ul>
        )}
        {roundId === "r3" && (
          <ul className="grid gap-1 sm:grid-cols-2">
            {full.rounds.r3.items.map((it, i) => (
              <li key={it.id} className={it.fake ? "text-alarm" : "text-acid"}>
                {i + 1}. {it.title} — {it.fake ? "FAKE" : "REAL"}
              </li>
            ))}
          </ul>
        )}
        {roundId === "r4" && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {full.rounds.r4.doors.map((door) => (
                <label key={door} className="rounded-xl border border-line bg-panel-2 p-3">
                  <span className="font-display text-xl font-black">Door {door}</span>
                  <select className="field mt-2 py-2 text-sm" value={full.vault[door] ?? ""} onChange={(e) => act({ type: "vault.assign", door, prizeIndex: Number(e.target.value) })}>
                    {full.vault[door] === undefined && <option value="">Not dealt</option>}
                    {full.rounds.r4.prizes.map((p, i) => (
                      <option key={p.label + i} value={i}>
                        {p.emoji} {p.label} ×{p.multiplier}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 flex gap-1">
                    {view.live.vaultOpened.includes(door) ? (
                      <button type="button" className="keycap text-[11px]" onClick={() => act({ type: "vault.close", door })}>
                        Close
                      </button>
                    ) : (
                      <button type="button" className="keycap keycap-honey text-[11px]" onClick={() => act({ type: "vault.open", door })}>
                        Open
                      </button>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <ConfirmButton className="keycap text-xs" confirmLabel="Reshuffle all doors?" onConfirm={() => void act({ type: "vault.shuffle" })}>
              🔀 Reshuffle prizes
            </ConfirmButton>
          </div>
        )}
        {roundId === "finale" && (
          <p>
            Thief: <b className="text-acid">{full.caseFile.suspects.find((s) => s.id === full.caseFile.solution.thiefId)?.name}</b> · Hideout:{" "}
            <b className="text-acid">{full.caseFile.locations.find((l) => l.id === full.caseFile.solution.locationId)?.name}</b> · Method:{" "}
            <b className="text-acid">{full.caseFile.methods.find((m) => m.id === full.caseFile.solution.methodId)?.name}</b>
          </p>
        )}
      </div>
    </details>
  );
}
