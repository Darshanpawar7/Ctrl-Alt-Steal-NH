import { useEffect, useState } from "react";
import type { EventInfo } from "../../../shared/types";
import { ConfirmButton, SectionLabel, errorText, useToast } from "../../components/ui";
import { timeOfDay } from "../../lib/format";
import { adminFetch, useStaff } from "./context";
import { Check, Grid, Num, Text } from "./fields";

export default function Data() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-black">Settings & data</h1>
        <p className="text-muted">Event details, backups, resets and the audit trail.</p>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <EventSettings />
        <div className="space-y-6">
          <Backups />
          <Danger />
        </div>
      </div>
      <Audit />
    </div>
  );
}

function EventSettings() {
  const { view, act } = useStaff();
  const toast = useToast();
  const [draft, setDraft] = useState<EventInfo>(view.event);
  const dirty = JSON.stringify(draft) !== JSON.stringify(view.event);
  useEffect(() => {
    if (!dirty) setDraft(view.event);
  }, [view.event]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<EventInfo>) => setDraft((d) => ({ ...d, ...patch }));
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
  const localStart = draft.startsAt ? new Date(Date.parse(draft.startsAt) - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";

  return (
    <section className="panel space-y-4 p-5">
      <SectionLabel>Event</SectionLabel>
      <Grid>
        <Text label="Event name" value={draft.name} onChange={(name) => set({ name })} />
        <Text label="Tagline" value={draft.tagline} onChange={(tagline) => set({ tagline })} />
        <Text label="Date (as shown on the site)" value={draft.dateText} onChange={(dateText) => set({ dateText })} placeholder="Friday, 14 November · 2 PM" />
        <label className="block">
          <span className="label">Start time (for the countdown)</span>
          <input type="datetime-local" className="field mt-1 text-sm" value={localStart} onChange={(e) => set({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : "" })} />
        </label>
        <Text label="Venue" value={draft.venue} onChange={(venue) => set({ venue })} />
        <Text label="Club" value={draft.club} onChange={(club) => set({ club })} />
        <Text label="Instagram link" value={draft.instagram} onChange={(instagram) => set({ instagram })} placeholder="https://instagram.com/…" />
        <Text label="Contact shown in the footer" value={draft.contact} onChange={(contact) => set({ contact })} />
      </Grid>
      <Grid cols={4}>
        <Num label="Starting credits" value={draft.startingCredits} onChange={(startingCredits) => set({ startingCredits })} />
        <Num label="Max teams" value={draft.maxTeams} onChange={(maxTeams) => set({ maxTeams })} />
        <Num label="Min members" value={draft.minMembers} onChange={(minMembers) => set({ minMembers })} />
        <Num label="Max members" value={draft.maxMembers} onChange={(maxMembers) => set({ maxMembers })} />
      </Grid>
      <div className="space-y-2">
        <Check label="Registration open on the website" value={draft.registrationOpen} onChange={(registrationOpen) => set({ registrationOpen })} />
        <Check label="Crews must be checked in to play (records attendance)" value={draft.requireCheckIn} onChange={(requireCheckIn) => set({ requireCheckIn })} />
      </div>
      <button
        type="button"
        className="keycap keycap-honey text-sm"
        disabled={!dirty}
        onClick={async () => {
          if (await act({ type: "event.set", value: draft })) toast("Event settings saved.", "good");
        }}
      >
        Save settings
      </button>
    </section>
  );
}

function Backups() {
  const { password } = useStaff();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    try {
      const response = await adminFetch(password, "/api/admin/backup");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ctrl-alt-steal-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(errorText(error), "bad");
    }
  }

  async function restore(file: File) {
    setBusy(true);
    try {
      await adminFetch(password, "/api/admin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
      toast("Backup restored. Every screen is updated.", "good");
    } catch (error) {
      toast(errorText(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-5">
      <SectionLabel>Backups</SectionLabel>
      <p className="text-sm text-muted">The game saves itself after every action. Download a backup before the event and after each round anyway: it's your undo button.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="keycap keycap-honey text-sm" onClick={download}>
          ⬇ Download backup
        </button>
        <label className="keycap cursor-pointer text-sm">
          {busy ? "Restoring…" : "⬆ Restore from file"}
          <input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        </label>
      </div>
    </section>
  );
}

function Danger() {
  const { act } = useStaff();
  const [count, setCount] = useState(8);
  return (
    <section className="panel space-y-4 border-alarm/30 p-5">
      <SectionLabel className="text-alarm">Practice & resets</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" className="field w-20 font-mono" min={1} max={16} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        <button type="button" className="keycap text-sm" onClick={() => act({ type: "demo.seed", count })}>
          + Add demo crews
        </button>
        <span className="text-xs text-muted">For the dry run. They're checked in and named like real crews.</span>
      </div>
      <div className="space-y-2">
        <ConfirmButton className="keycap text-sm" confirmLabel="Reset all progress?" onConfirm={() => void act({ type: "game.reset", mode: "progress" })}>
          ↺ Reset after dry run
        </ConfirmButton>
        <p className="text-xs text-muted">Keeps crews and content. Clears answers, credits, hints, check-ins and the vault. Remove demo crews on the Teams page.</p>
      </div>
      <div className="space-y-2">
        <ConfirmButton className="keycap text-sm" confirmLabel="Wipe EVERYTHING?" onConfirm={() => void act({ type: "game.reset", mode: "everything" })}>
          ☢ Factory reset
        </ConfirmButton>
        <p className="text-xs text-muted">Deletes every crew and puts the default case back. Download a backup first.</p>
      </div>
    </section>
  );
}

function Audit() {
  const { view } = useStaff();
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();
  const entries = [...view.staff.audit].reverse().filter((a) => !q || `${a.summary} ${a.type} ${a.by}`.toLowerCase().includes(q));
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Audit log · every staff action</SectionLabel>
        <input className="field max-w-xs py-2 text-sm" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ol className="mt-4 max-h-[480px] space-y-1 overflow-y-auto font-mono text-xs">
        {entries.map((a) => (
          <li key={a.id} className="grid grid-cols-[6rem_6rem_1fr] gap-3 rounded-lg px-2 py-1.5 hover:bg-panel-2">
            <span className="text-muted">{timeOfDay(a.at)}</span>
            <span className={a.by === "admin" ? "text-honey" : a.by === "volunteer" ? "text-ice" : "text-muted"}>{a.by}</span>
            <span>{a.summary}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="text-muted">Nothing logged yet.</li>}
      </ol>
    </section>
  );
}
