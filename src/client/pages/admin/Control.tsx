import { useState } from "react";
import type { Action } from "../../../shared/protocol";
import { REVEAL_STEPS, ROUND_IDS, type RoundId, type Stage } from "../../../shared/types";
import { ConfirmButton, Dot, SectionLabel } from "../../components/ui";
import { useStaff } from "./context";
import { STEPS, backActions, goToActions, nextStepIndex } from "./runOfShow";

type Act = (action: Action) => Promise<boolean>;

/** Sends actions one after another, stopping at the first that fails. */
async function runInOrder(act: Act, actions: Action[]): Promise<void> {
  for (const action of actions) {
    if (!(await act(action))) return;
  }
}

export default function Control() {
  const { view, act } = useStaff();
  const nextIndex = nextStepIndex(view);
  const next = nextIndex >= 0 ? STEPS[nextIndex] : null;
  const back = backActions(view);
  const [busy, setBusy] = useState(false);

  async function run(actions: Action[]) {
    setBusy(true);
    await runInOrder(act, actions);
    setBusy(false);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="space-y-5">
        <div className="panel overflow-hidden">
          <div className="tape h-2" />
          <div className="flex flex-wrap items-center gap-5 p-5">
            <div className="min-w-0 flex-1">
              <p className="label text-honey">Up next {next ? `· ${next.at}` : ""}</p>
              <p className="mt-1 font-display text-2xl font-black">{next ? next.title : "Event complete 🎉"}</p>
              {next && <p className="mt-1 text-sm text-muted">{next.detail}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {back && (
                <ConfirmButton className="keycap px-5 py-4 text-base" confirmLabel="Undo the last step?" disabled={busy} onConfirm={() => run(back)}>
                  ◀ Back
                </ConfirmButton>
              )}
              {next && (
                <button type="button" className="keycap keycap-honey px-8 py-4 text-xl" disabled={busy} onClick={() => run(next.actions)}>
                  ▶ Next
                </button>
              )}
            </div>
          </div>
        </div>

        {(view.live.roundId === "r4" && (view.status.r4 === "locked" || view.status.r4 === "revealed")) && <VaultDoors />}
        {view.live.stage === "finalReveal" && <RevealSteps />}

        <div>
          <SectionLabel>Run of show</SectionLabel>
          <p className="mt-1 text-xs text-muted">Back and “Go back here” rewind the show: rounds return to how they were and the timer stops. Crews' answers are always kept. Back from a lock reopens answers for 2 minutes.</p>
          <ol className="mt-3 space-y-1.5">
            {STEPS.map((step, index) => {
              const isNext = index === nextIndex;
              const isPast = nextIndex === -1 || index < nextIndex;
              const isDone = step.done(view) && !isNext;
              return (
                <li key={step.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 sm:gap-4 sm:px-4 ${isNext ? "border-honey bg-honey/10" : "border-line bg-panel"} ${isDone ? "opacity-70" : ""}`}>
                  <span className="w-9 shrink-0 font-mono text-xs text-honey sm:w-11">{step.at}</span>
                  <span className="w-5 shrink-0 text-center">{isDone ? "✓" : isNext ? "▶" : "·"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{step.title}</span>
                    <span className="block truncate text-xs text-muted">{step.detail}</span>
                  </span>
                  {isPast ? (
                    <ConfirmButton className="keycap shrink-0 text-xs" confirmLabel="Go back?" disabled={busy} onConfirm={() => run(goToActions(index))}>
                      ↺ Go back here
                    </ConfirmButton>
                  ) : (
                    <button type="button" className="keycap shrink-0 text-xs" disabled={busy} onClick={() => run(step.actions)}>
                      Run
                    </button>
                  )}
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
        <ResetPanel busy={busy} run={run} />
      </aside>
    </div>
  );
}

type ResetPanelProps = {
  /** True while the Control room is still sending an earlier set of actions. */
  busy: boolean;
  run: (actions: Action[]) => Promise<void>;
};

function ResetPanel({ busy, run }: ResetPanelProps) {
  const { view } = useStaff();
  const [roundId, setRoundId] = useState<RoundId>("r1");
  return (
    <div className="panel space-y-4 p-4">
      <SectionLabel>Go back or reset</SectionLabel>
      <div>
        <ConfirmButton className="keycap w-full text-xs" confirmLabel="Rewind to check-in?" disabled={busy} onConfirm={() => run(goToActions(0))}>
          ⏮ Back to check-in
        </ConfirmButton>
        <p className="mt-1.5 text-xs text-muted">Every round goes back to hidden and the timer stops. Answers are kept, so nothing is lost.</p>
      </div>
      <div>
        <p className="label">Reset one round</p>
        <div className="mt-2 flex gap-2">
          <select className="field min-w-0 py-1.5 text-sm" value={roundId} onChange={(e) => setRoundId(e.target.value as RoundId)} aria-label="Round to reset">
            {ROUND_IDS.map((id) => (
              <option key={id} value={id}>
                {view.rounds[id].codename} · {view.rounds[id].title}
              </option>
            ))}
          </select>
          <ConfirmButton className="keycap shrink-0 text-xs" confirmLabel="Clear it?" disabled={busy} onConfirm={() => run([{ type: "round.reset", roundId }])}>
            Reset
          </ConfirmButton>
        </div>
        <p className="mt-1.5 text-xs text-muted">Clears every crew's answers and hints for that round and hides it, ready to run again.</p>
      </div>
      <div>
        <ConfirmButton className="keycap w-full text-xs" confirmLabel="Clear all progress?" disabled={busy} onConfirm={() => run([{ type: "game.reset", mode: "progress" }])}>
          ↺ Reset after dry run
        </ConfirmButton>
        <p className="mt-1.5 text-xs text-muted">Clears all answers, scores, check-ins and the live feed, and goes back to check-in. Crews and content stay.</p>
      </div>
      <p className="text-xs text-muted">Anything else: restore a backup from Settings &amp; data to undo it.</p>
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
