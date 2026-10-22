import { useState } from "react";
import type { Action, StaffView } from "../../../shared/protocol";
import { REVEAL_STEPS, type RoundId, type RoundStatus, type Stage } from "../../../shared/types";
import { ConfirmButton, Dot, SectionLabel } from "../../components/ui";
import { useStaff } from "./context";

interface Step {
  id: string;
  at: string;
  title: string;
  detail: string;
  actions: Action[];
  /** True once the game has reached (or moved past) this step. */
  done: (v: StaffView) => boolean;
}

const after = (status: RoundStatus, ...ok: RoundStatus[]) => ok.includes(status);
const LATE_STAGES: Stage[] = ["consolidation", "finalReveal", "podium"];

function roundSteps(id: RoundId, at: [string, string, string, string], label: string): Step[] {
  return [
    { id: `${id}-intro`, at: at[0], title: `${label}: explain the round`, detail: "Shows the rules and content on the big screen. Answers stay closed.", actions: [{ type: "round.set", roundId: id, status: "intro" }], done: (v) => v.status[id] !== "pending" },
    { id: `${id}-open`, at: at[1], title: `${label}: GO`, detail: "Starts the countdown. Phones can answer until it hits zero.", actions: [{ type: "round.set", roundId: id, status: "open" }], done: (v) => after(v.status[id], "open", "locked", "revealed") },
    { id: `${id}-lock`, at: at[2], title: `${label}: lock answers`, detail: "Happens on its own at 00:00. Use this to lock early. Enter paper slips now.", actions: [{ type: "round.set", roundId: id, status: "locked" }], done: (v) => after(v.status[id], "locked", "revealed") },
    { id: `${id}-reveal`, at: at[3], title: `${label}: reveal`, detail: id === "r4" ? "Switches to the vault. Open the doors one by one below." : "Shows the answers, pays out credits and unlocks the clue.", actions: [{ type: "round.set", roundId: id, status: "revealed" }], done: (v) => v.status[id] === "revealed" },
  ];
}

function revealStep(step: number, at: string, title: string, detail: string): Step {
  return {
    id: `reveal-${step}`,
    at,
    title,
    detail,
    actions: [{ type: "live.revealStep", step }],
    done: (v) => v.live.stage === "podium" || (v.live.stage === "finalReveal" && v.live.revealStep >= step),
  };
}

const STEPS: Step[] = [
  { id: "lobby", at: "0:00", title: "Open check-in", detail: "Lobby screen with the join QR. Check crews in on the Teams page.", actions: [{ type: "stage.set", stage: "lobby" }], done: () => true },
  { id: "briefing", at: "0:15", title: "Briefing & story", detail: "The story, the timeline and the six suspects.", actions: [{ type: "stage.set", stage: "briefing" }], done: (v) => v.live.stage !== "lobby" || v.status.r1 !== "pending" },
  ...roundSteps("r1", ["0:25", "0:30", "0:40", "0:43"], "Trading Floor"),
  { id: "lb1", at: "0:48", title: "Leaderboard", detail: "Show the standings after Round 1.", actions: [{ type: "stage.set", stage: "leaderboard" }], done: (v) => v.status.r2 !== "pending" || (v.status.r1 === "revealed" && v.live.stage === "leaderboard") },
  ...roundSteps("r2", ["0:50", "0:53", "1:08", "1:10"], "Training Log"),
  ...roundSteps("r3", ["1:15", "1:18", "1:30", "1:33"], "Lineup"),
  { id: "lb3", at: "1:38", title: "Leaderboard", detail: "Standings before the break.", actions: [{ type: "stage.set", stage: "leaderboard" }], done: (v) => v.live.stage === "break" || v.status.r4 !== "pending" || (v.status.r3 === "revealed" && v.live.stage === "leaderboard") },
  { id: "break", at: "1:40", title: "Break (10 min)", detail: "Break screen with a countdown and AI facts.", actions: [{ type: "stage.set", stage: "break" }, { type: "timer.start", seconds: 600, label: "Break" }], done: (v) => v.live.stage === "break" || v.status.r4 !== "pending" },
  ...roundSteps("r4", ["1:50", "1:53", "2:00", "2:02"], "Vault"),
  { id: "blackout", at: "2:09", title: "Leaderboard blackout", detail: "Hide the rankings from here to the reveal. Teams still see their own credits.", actions: [{ type: "live.leaderboard", hidden: true }, { type: "stage.set", stage: "leaderboard" }], done: (v) => v.live.leaderboardHidden || LATE_STAGES.includes(v.live.stage) || v.status.finale !== "pending" },
  { id: "consolidate", at: "2:10", title: "Connect the dots (15 min)", detail: "All clues on screen. Volunteers give no hints.", actions: [{ type: "stage.set", stage: "consolidation" }, { type: "timer.start", seconds: 900, label: "Clue consolidation" }], done: (v) => LATE_STAGES.includes(v.live.stage) || v.status.finale !== "pending" },
  { id: "finale-open", at: "2:25", title: "Name the Thief: GO", detail: "Final answers and bets. 8 minutes.", actions: [{ type: "round.set", roundId: "finale", status: "open" }], done: (v) => after(v.status.finale, "open", "locked", "revealed") },
  { id: "finale-lock", at: "2:33", title: "Lock final answers", detail: "Happens at 00:00. Enter any paper slips before the reveal.", actions: [{ type: "round.set", roundId: "finale", status: "locked" }], done: (v) => after(v.status.finale, "locked", "revealed") },
  { id: "reveal", at: "2:37", title: "The reveal begins", detail: "“The answers are in” + the total credits on the line.", actions: [{ type: "stage.set", stage: "finalReveal" }], done: (v) => v.live.stage === "finalReveal" || v.live.stage === "podium" },
  revealStep(1, "2:38", "Reveal: the thief", "Drumroll, then the thief and how many crews named them."),
  revealStep(2, "2:40", "Reveal: the hideout", "Where QUEENBEE was hidden."),
  revealStep(3, "2:42", "Reveal: the recovery", "How to get it back. Final bets pay out now."),
  revealStep(4, "2:44", "Epilogue", "Case closed."),
  revealStep(5, "2:45", "Final standings", "The leaderboard returns, with every final bet."),
  { id: "podium", at: "2:47", title: "Podium & badges", detail: "Top three, confetti, fanfare and the badge wall.", actions: [{ type: "stage.set", stage: "podium" }], done: (v) => v.live.stage === "podium" },
];

export default function Control() {
  const { view, act } = useStaff();
  const nextIndex = STEPS.findIndex((s) => !s.done(view));
  const next = nextIndex >= 0 ? STEPS[nextIndex] : null;
  const [busy, setBusy] = useState(false);

  async function run(step: Step) {
    setBusy(true);
    for (const action of step.actions) {
      if (!(await act(action))) break;
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
      <section className="space-y-5">
        <div className="panel overflow-hidden">
          <div className="tape h-2" />
          <div className="flex flex-wrap items-center gap-5 p-5">
            <div className="min-w-0 flex-1">
              <p className="label text-honey">Up next {next ? `· ${next.at}` : ""}</p>
              <p className="mt-1 font-display text-2xl font-black">{next ? next.title : "Event complete 🎉"}</p>
              {next && <p className="mt-1 text-sm text-muted">{next.detail}</p>}
            </div>
            {next && (
              <button type="button" className="keycap keycap-honey px-8 py-4 text-xl" disabled={busy} onClick={() => run(next)}>
                ▶ Next
              </button>
            )}
          </div>
        </div>

        {(view.live.roundId === "r4" && (view.status.r4 === "locked" || view.status.r4 === "revealed")) && <VaultDoors />}
        {view.live.stage === "finalReveal" && <RevealSteps />}

        <div>
          <SectionLabel>Run of show</SectionLabel>
          <ol className="mt-3 space-y-1.5">
            {STEPS.map((step, index) => {
              const isNext = index === nextIndex;
              const isDone = step.done(view) && !isNext;
              return (
                <li key={step.id} className={`flex items-center gap-4 rounded-xl border px-4 py-2.5 ${isNext ? "border-honey bg-honey/10" : "border-line bg-panel"} ${isDone ? "opacity-55" : ""}`}>
                  <span className="w-11 shrink-0 font-mono text-xs text-honey">{step.at}</span>
                  <span className="w-5 text-center">{isDone ? "✓" : isNext ? "▶" : "·"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{step.title}</span>
                    <span className="block truncate text-xs text-muted">{step.detail}</span>
                  </span>
                  <button type="button" className="keycap shrink-0 text-xs" disabled={busy} onClick={() => run(step)}>
                    Run
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <aside className="space-y-5">
        <Preview />
        <Tracker />
        <Announce />
        <QuickControls />
      </aside>
    </div>
  );
}

function VaultDoors() {
  const { view, act } = useStaff();
  const full = view.full!;
  const r4 = full.rounds.r4;
  const picks = view.stats.vaultPicks ?? [];
  return (
    <div className="panel p-5">
      <SectionLabel>Open the vault · pick the order for maximum drama</SectionLabel>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {r4.doors.map((door) => {
          const prize = r4.prizes[full.vault[door] ?? -1];
          const opened = view.live.vaultOpened.includes(door);
          const crews = picks.find((p) => p.door === door)?.teams.length ?? 0;
          return (
            <button
              key={door}
              type="button"
              disabled={opened}
              onClick={() => act({ type: "vault.open", door })}
              className={`rounded-xl border-2 p-3 text-center transition ${opened ? "border-line opacity-50" : "border-honey hover:bg-honey/10"}`}
            >
              <span className="block font-display text-2xl font-black">{door}</span>
              <span className="block text-xs text-muted">{prize ? `${prize.emoji} ${prize.label}` : "?"}</span>
              <span className="block text-xs text-muted">{crews} crew{crews === 1 ? "" : "s"}</span>
              <span className="mt-1 block text-[11px] font-bold text-honey">{opened ? "Opened" : "Open ▶"}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Tip: open the empty doors first and save the jackpot for last. Payouts land on each phone as its door opens.</p>
    </div>
  );
}

function RevealSteps() {
  const { view, act } = useStaff();
  return (
    <div className="panel p-5">
      <SectionLabel>Final reveal</SectionLabel>
      <div className="mt-4 flex flex-wrap gap-2">
        {REVEAL_STEPS.map((name, step) => (
          <button key={name} type="button" className={`keycap text-xs ${view.live.revealStep === step ? "keycap-honey" : ""}`} onClick={() => act({ type: "live.revealStep", step })}>
            {step}. {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Preview() {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <SectionLabel>Projector preview</SectionLabel>
        <a href="/screen" target="_blank" rel="noopener noreferrer" className="text-xs text-honey hover:underline">
          Open ↗
        </a>
      </div>
      <div className="relative aspect-video overflow-hidden border-t border-line bg-ink">
        <iframe src="/screen?preview" title="Projector preview" className="pointer-events-none absolute top-0 left-0 h-[400%] w-[400%] origin-top-left scale-25 border-0" />
      </div>
    </div>
  );
}

function Tracker() {
  const { view } = useStaff();
  const roundId = view.live.roundId;
  if (!roundId) return null;
  const crews = view.staff.teams.filter((t) => t.checkedIn && !t.disqualified);
  const submitted = new Set(view.stats.submitted[roundId]);
  const locked = new Set(view.stats.lockedIn[roundId]);
  const missing = crews.filter((t) => !submitted.has(t.id));
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between">
        <SectionLabel>{view.rounds[roundId].codename} answers</SectionLabel>
        <span className="font-mono text-sm">
          {crews.length - missing.length}/{crews.length}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {crews.map((t) => (
          <span key={t.id} title={t.name} className={`grid size-9 place-items-center rounded-lg text-lg ${locked.has(t.id) ? "bg-honey" : submitted.has(t.id) ? "bg-panel-3" : "bg-alarm/20 ring-1 ring-alarm/50"}`}>
            {t.emoji}
          </span>
        ))}
      </div>
      {missing.length > 0 && <p className="mt-3 text-xs text-alarm">No answer yet: {missing.map((t) => t.name).join(", ")}</p>}
    </div>
  );
}

function Announce() {
  const { view, act } = useStaff();
  const [text, setText] = useState("");
  return (
    <div className="panel p-4">
      <SectionLabel>Announcement</SectionLabel>
      <p className="mt-2 text-xs text-muted">Shows on the projector for 25 seconds and on every phone until dismissed.</p>
      <div className="mt-3 flex gap-2">
        <input className="field" value={text} maxLength={280} placeholder="e.g. 2 minutes left!" onChange={(e) => setText(e.target.value)} />
        <button
          type="button"
          className="keycap keycap-honey shrink-0 text-xs"
          disabled={!text.trim()}
          onClick={async () => {
            if (await act({ type: "announce", text })) setText("");
          }}
        >
          Send
        </button>
      </div>
      {view.live.announcement && (
        <button type="button" className="mt-2 text-xs text-muted hover:text-alarm" onClick={() => act({ type: "announce", text: "" })}>
          Clear “{view.live.announcement.text}”
        </button>
      )}
    </div>
  );
}

const SCREENS: [Stage, string][] = [
  ["lobby", "Lobby"],
  ["briefing", "Briefing"],
  ["leaderboard", "Leaderboard"],
  ["break", "Break"],
  ["consolidation", "Dots"],
  ["podium", "Podium"],
];

function QuickControls() {
  const { view, act } = useStaff();
  const [minutes, setMinutes] = useState("5");
  return (
    <div className="panel space-y-4 p-4">
      <SectionLabel>Big screen</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        {SCREENS.map(([stage, label]) => (
          <button key={stage} type="button" className={`keycap text-xs ${view.live.stage === stage ? "keycap-honey" : ""}`} onClick={() => act({ type: "stage.set", stage })}>
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2.5">
        <span className="text-sm">
          <Dot on={!view.live.leaderboardHidden} className="mr-2" />
          Leaderboard visible
        </span>
        <input type="checkbox" className="size-5 accent-honey" checked={!view.live.leaderboardHidden} onChange={(e) => act({ type: "live.leaderboard", hidden: !e.target.checked })} />
      </label>
      <div>
        <p className="label">Custom timer</p>
        <div className="mt-2 flex gap-2">
          <input className="field w-20 text-center font-mono" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" />
          <button type="button" className="keycap text-xs" onClick={() => act({ type: "timer.start", seconds: Math.round(Number(minutes) * 60) || 60, label: "Timer" })}>
            Start {minutes} min
          </button>
          <ConfirmButton className="keycap text-xs" onConfirm={() => void act({ type: "timer.clear" })}>
            Clear
          </ConfirmButton>
        </div>
      </div>
    </div>
  );
}
