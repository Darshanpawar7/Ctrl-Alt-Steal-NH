import { useState } from "react";
import type { AdminSecrets } from "../../../shared/protocol";
import { ROUND_IDS, type RoundId, type Team } from "../../../shared/types";
import { QrCode } from "../../components/QrCode";
import { ROUND_LABEL, formatCode } from "../../lib/format";
import { linkTo } from "../../lib/router";
import { useStaff } from "./context";

type Kind = "cards" | "slips" | "scorecard";

export default function Print() {
  const { view } = useStaff();
  const [kind, setKind] = useState<Kind>("cards");
  const [roundId, setRoundId] = useState<RoundId>("r1");
  const [onlyPresent, setOnlyPresent] = useState(false);
  const teams = view.staff.teams.filter((t) => !onlyPresent || t.checkedIn).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-dvh bg-[#d9d6cf] print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-ink px-4 py-3 text-paper">
        <a href="/admin/teams" onClick={linkTo("/admin/teams")} className="keycap text-xs">
          ← Back
        </a>
        {(
          [
            ["cards", "Team code cards"],
            ["slips", "Paper answer slips"],
            ["scorecard", "Backup scorecard"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={`keycap text-xs ${kind === k ? "keycap-honey" : ""}`} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
        {kind === "slips" && (
          <select className="field w-auto py-1.5 text-sm" value={roundId} onChange={(e) => setRoundId(e.target.value as RoundId)}>
            {ROUND_IDS.map((id) => (
              <option key={id} value={id}>
                {ROUND_LABEL[id]} · {view.rounds[id].title}
              </option>
            ))}
          </select>
        )}
        <label className="ml-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-honey" checked={onlyPresent} onChange={(e) => setOnlyPresent(e.target.checked)} />
          Checked-in crews only
        </label>
        <button type="button" className="keycap keycap-honey ml-auto text-xs" onClick={() => window.print()}>
          🖨 Print
        </button>
      </div>

      <div className="mx-auto max-w-[210mm] bg-white p-[10mm] text-black shadow-xl print:max-w-none print:p-0 print:shadow-none">
        {kind === "cards" && <CodeCards teams={teams} />}
        {kind === "slips" && view.full && <Slips teams={teams} roundId={roundId} state={view.full} />}
        {kind === "slips" && !view.full && <BlankSlips teams={teams} roundId={roundId} />}
        {kind === "scorecard" && <Scorecard teams={teams} />}
      </div>
    </div>
  );
}

function CodeCards({ teams }: { teams: Team[] }) {
  const origin = window.location.origin;
  return (
    <div className="grid grid-cols-2 gap-[6mm]">
      {teams.map((team) => (
        <div key={team.id} className="flex break-inside-avoid items-center gap-[4mm] rounded-[3mm] border-2 border-dashed border-black/40 p-[5mm]">
          <QrCode text={`${origin}/play?code=${team.code}`} size={110} dark="#000000" light="#ffffff" />
          <div className="min-w-0">
            <p className="text-[9pt] tracking-widest text-black/60 uppercase">Ctrl+Alt+Steal · crew code</p>
            <p className="truncate text-[14pt] font-bold">
              {team.emoji} {team.name}
            </p>
            <p className="font-mono text-[24pt] leading-tight font-black tracking-[0.15em]">{formatCode(team.code)}</p>
            <p className="text-[8pt] text-black/70">Scan, or open {origin.replace(/^https?:\/\//, "")}/play and type the code.</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlipHeader({ team, title }: { team: Team; title: string }) {
  return (
    <div className="mb-[3mm] flex items-baseline justify-between border-b-2 border-black pb-[2mm]">
      <p className="text-[13pt] font-black">{title}</p>
      <p className="text-[11pt]">
        {team.emoji} <b>{team.name}</b> · <span className="font-mono">{formatCode(team.code)}</span>
      </p>
    </div>
  );
}

const box = "inline-block size-[4mm] border-[1.5px] border-black align-middle";

/** Pre-filled slips for one round. Uses only public round content, never the keys. */
function Slips({ teams, roundId, state }: { teams: Team[]; roundId: RoundId; state: AdminSecrets }) {
  const r = state.rounds;
  const c = state.caseFile;
  const title = `${ROUND_LABEL[roundId]} · ${r[roundId].title}`;
  return (
    <div>
      {teams.map((team) => (
        <section key={team.id} className="mb-[8mm] break-inside-avoid border-b border-dashed border-black/40 pb-[8mm] text-[10pt]">
          <SlipHeader team={team} title={title} />
          {roundId === "r1" && (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="w-[10mm]">#</th>
                  <th>Lead</th>
                  <th className="w-[14mm]">Odds</th>
                  <th className="w-[30mm]">Stake</th>
                </tr>
              </thead>
              <tbody>
                {r.r1.leads.map((l, i) => (
                  <tr key={l.id} className="border-t border-black/20">
                    <td>L{i + 1}</td>
                    <td className="py-[1mm] pr-[2mm] text-[8.5pt]">{l.text}</td>
                    <td>×{l.odds}</td>
                    <td className="border-b border-black" />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-[2mm] text-[8.5pt]">
                    Total stake must be at most {r.r1.maxStake} credits.
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
          {roundId === "r2" &&
            r.r2.questions.map((q, i) => (
              <p key={q.id} className="mb-[4mm]">
                <b>Q{i + 1}.</b> {q.prompt}
                <span className="mt-[5mm] block border-b border-black" />
              </p>
            ))}
          {roundId === "r3" && (
            <ol className="grid grid-cols-2 gap-x-[6mm] gap-y-[2mm]">
              {r.r3.items.map((it, i) => (
                <li key={it.id} className="flex items-center gap-[2mm]">
                  <span className="w-[6mm] font-bold">{i + 1}.</span>
                  <span className="flex-1 truncate">{it.title}</span>
                  <span className={box} /> Real <span className={box} /> Fake
                </li>
              ))}
            </ol>
          )}
          {roundId === "r4" && (
            <div className="space-y-[3mm]">
              <p>
                <span className={box} /> <b>Bank it</b> (keep my credits) &nbsp;&nbsp; <span className={box} /> <b>Crack the vault</b>
              </p>
              <p>
                Door (circle one): {r.r4.doors.map((d) => <b key={d} className="mx-[2mm] text-[13pt]">{d}</b>)}
              </p>
              <p>
                Wager ({r.r4.minWager} to {r.r4.maxWagerPct}% of your credits): <span className="inline-block w-[40mm] border-b border-black" />
              </p>
            </div>
          )}
          {roundId === "finale" && (
            <div className="grid grid-cols-3 gap-[4mm] text-[9pt]">
              {[
                ["Thief", c.suspects],
                ["Hideout", c.locations],
                ["Recovery", c.methods],
              ].map(([label, list]) => (
                <div key={label as string}>
                  <p className="mb-[1mm] font-bold">{label as string}</p>
                  {(list as { id: string; name: string }[]).map((o) => (
                    <p key={o.id} className="flex items-center gap-[1.5mm]">
                      <span className={box} /> {o.name}
                    </p>
                  ))}
                </div>
              ))}
              <p className="col-span-3 mt-[2mm]">
                Final bet: <span className="inline-block w-[40mm] border-b border-black" /> credits
              </p>
            </div>
          )}
          <p className="mt-[3mm] text-[8pt] text-black/60">Volunteer: enter this on Admin → Rounds & answers → {ROUND_LABEL[roundId]} → Enter.</p>
        </section>
      ))}
    </div>
  );
}

/** Volunteers can't see round content before it's shown, so their slips are generic. */
function BlankSlips({ teams, roundId }: { teams: Team[]; roundId: RoundId }) {
  return (
    <div>
      {teams.map((team) => (
        <section key={team.id} className="mb-[8mm] break-inside-avoid border-b border-dashed border-black/40 pb-[8mm]">
          <SlipHeader team={team} title={ROUND_LABEL[roundId]} />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="mt-[7mm] block border-b border-black" />
          ))}
        </section>
      ))}
    </div>
  );
}

function Scorecard({ teams }: { teams: Team[] }) {
  return (
    <div>
      <p className="mb-[4mm] text-[14pt] font-black">Ctrl+Alt+Steal · backup scorecard</p>
      <table className="w-full border-collapse text-[10pt]">
        <thead>
          <tr>
            <th className="border border-black p-[1.5mm] text-left">Crew</th>
            <th className="border border-black p-[1.5mm]">Code</th>
            {["Start", "R1", "R2", "R3", "R4", "Final bet", "Total"].map((h) => (
              <th key={h} className="w-[17mm] border border-black p-[1.5mm]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id}>
              <td className="border border-black p-[1.5mm]">
                {t.emoji} {t.name}
              </td>
              <td className="border border-black p-[1.5mm] font-mono">{formatCode(t.code)}</td>
              {Array.from({ length: 7 }, (_, i) => (
                <td key={i} className="h-[9mm] border border-black" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
