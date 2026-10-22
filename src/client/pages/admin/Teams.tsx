import { useState, type FormEvent } from "react";
import type { TeamInput } from "../../../shared/protocol";
import type { Member, Team } from "../../../shared/types";
import { ConfirmButton, Credits, Dot, Modal, SectionLabel } from "../../components/ui";
import { downloadFile, formatCode, timeOfDay, toCsv } from "../../lib/format";
import { TEAM_EMOJIS } from "../../lib/emojis";
import { useStaff } from "./context";

type Filter = "all" | "in" | "out";

export default function Teams() {
  const { view, act, isAdmin } = useStaff();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const teams = view.staff.teams;
  const q = query.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const shown = teams
    .filter((t) => (filter === "in" ? t.checkedIn : filter === "out" ? !t.checkedIn : true))
    .filter((t) => !q || `${t.name} ${t.code} ${t.members.map((m) => `${m.name} ${m.srn}`).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => Number(a.checkedIn) - Number(b.checkedIn) || a.name.localeCompare(b.name));
  const checkedIn = teams.filter((t) => t.checkedIn).length;

  function exportAttendance() {
    const rows: (string | number)[][] = [["Team", "Code", "Checked in", "Check-in time", "Members", "SRNs", "Contact", "Credits", "Source"]];
    for (const t of teams) {
      rows.push([
        t.name,
        formatCode(t.code),
        t.checkedIn ? "Yes" : "No",
        t.checkedInAt ? new Date(t.checkedInAt).toLocaleString("en-IN") : "",
        t.members.map((m) => m.name).join("; "),
        t.members.map((m) => m.srn).join("; "),
        t.contact,
        view.staff.ledgers[t.id]?.total ?? 0,
        t.source,
      ]);
    }
    downloadFile(`attendance-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black">Teams & check-in</h1>
          <p className="text-muted">
            <b className="text-honey">{checkedIn}</b> of {teams.length} crews checked in ·{" "}
            {teams.reduce((n, t) => n + (t.checkedIn ? t.members.length : 0), 0)} people present
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="keycap keycap-honey text-sm" onClick={() => setEditing("new")}>
            + Walk-in crew
          </button>
          <button type="button" className="keycap text-sm" onClick={exportAttendance}>
            ⬇ Attendance CSV
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <input className="field max-w-md" placeholder="Search name, code, member or SRN…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        {(["all", "out", "in"] as Filter[]).map((f) => (
          <button key={f} type="button" className={`keycap text-xs ${filter === f ? "keycap-honey" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "out" ? "Not checked in" : "Checked in"}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {shown.map((team) => {
          const devices = view.staff.presence.teams[team.id] ?? 0;
          return (
            <li key={team.id} className={`panel flex flex-wrap items-center gap-4 p-4 ${team.disqualified ? "border-alarm/50 opacity-70" : ""}`}>
              <span className="grid size-12 place-items-center rounded-xl bg-panel-3 text-2xl">{team.emoji}</span>
              <div className="min-w-[180px] flex-1">
                <p className="font-display font-bold">
                  {team.name} {team.disqualified && <span className="chip ml-2 border-alarm text-xs text-alarm">DQ</span>}
                  {team.source === "desk" && <span className="chip ml-2 text-xs">walk-in</span>}
                </p>
                <p className="text-sm text-muted">{team.members.map((m) => m.name + (m.srn ? ` (${m.srn})` : "")).join(" · ") || "No members listed"}</p>
                {team.notes && <p className="text-xs text-ice">📝 {team.notes}</p>}
              </div>
              <span className="font-mono text-lg font-bold tracking-widest text-honey">{formatCode(team.code)}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted" title="Phones connected">
                <Dot on={devices > 0} /> {devices} 📱
              </span>
              <Credits value={view.staff.ledgers[team.id]?.total ?? 0} className="text-sm text-honey" />
              <button
                type="button"
                className={`keycap min-w-36 text-sm ${team.checkedIn ? "keycap-acid" : ""}`}
                onClick={() => act({ type: "team.checkin", id: team.id, value: !team.checkedIn })}
                title={team.checkedInAt ? `Checked in at ${timeOfDay(team.checkedInAt)}` : undefined}
              >
                {team.checkedIn ? `✓ In · ${timeOfDay(team.checkedInAt ?? 0).slice(0, 5)}` : "Check in"}
              </button>
              <button type="button" className="keycap text-xs" onClick={() => setEditing(team)}>
                Edit
              </button>
              {isAdmin && (
                <div className="flex flex-wrap gap-1.5">
                  <ConfirmButton className="keycap text-xs" confirmLabel="New code?" onConfirm={() => void act({ type: "team.newCode", id: team.id })}>
                    🔑 New code
                  </ConfirmButton>
                  <ConfirmButton className="keycap text-xs" confirmLabel={team.disqualified ? "Reinstate?" : "Disqualify?"} onConfirm={() => void act({ type: "team.dq", id: team.id, value: !team.disqualified })}>
                    {team.disqualified ? "Reinstate" : "DQ"}
                  </ConfirmButton>
                  <ConfirmButton className="keycap text-xs" confirmLabel="Delete forever?" onConfirm={() => void act({ type: "team.remove", id: team.id })}>
                    🗑
                  </ConfirmButton>
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="rounded-2xl border border-dashed border-line-2 p-8 text-center text-muted">No crews match.</li>}
      </ul>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a walk-in crew" : "Edit crew"}>
        {editing !== null && <TeamForm team={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function TeamForm({ team, onDone }: { team: Team | null; onDone: () => void }) {
  const { act, view } = useStaff();
  const max = view.event.maxMembers;
  const [name, setName] = useState(team?.name ?? "");
  const [emoji, setEmoji] = useState(team?.emoji ?? "🐝");
  const [members, setMembers] = useState<Member[]>(() => {
    const list = team?.members.length ? team.members : [];
    return [...list, ...Array.from({ length: Math.max(0, max - list.length) }, () => ({ name: "", srn: "" }))];
  });
  const [contact, setContact] = useState(team?.contact ?? "");
  const [notes, setNotes] = useState(team?.notes ?? "");
  const [checkIn, setCheckIn] = useState(true);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const input: TeamInput = { name, emoji, members: members.filter((m) => m.name.trim()), contact, notes };
    const ok = team ? await act({ type: "team.update", id: team.id, team: input }) : await act({ type: "team.add", team: input, checkIn });
    if (ok) onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="label">Crew name</span>
        <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {TEAM_EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => setEmoji(e)} className={`grid size-10 place-items-center rounded-lg border text-xl ${emoji === e ? "border-honey bg-honey/15" : "border-line"}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <span className="label">Members</span>
        {members.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_9rem] gap-2">
            <input className="field" placeholder={`Member ${i + 1}`} value={m.name} onChange={(e) => setMembers((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="field font-mono uppercase" placeholder="SRN" value={m.srn} onChange={(e) => setMembers((list) => list.map((x, j) => (j === i ? { ...x, srn: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <label className="block">
        <span className="label">Contact</span>
        <input className="field mt-1" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} />
      </label>
      <label className="block">
        <span className="label">Notes (staff only)</span>
        <input className="field mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. arrived late, swapped a member" />
      </label>
      {!team && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-honey" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} />
          Check them in now
        </label>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="keycap text-sm" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="keycap keycap-honey text-sm">
          {team ? "Save changes" : "Add crew"}
        </button>
      </div>
      {team && <SectionLabel className="pt-2">Code: {formatCode(team.code)} · created {new Date(team.createdAt).toLocaleString("en-IN")}</SectionLabel>}
    </form>
  );
}
