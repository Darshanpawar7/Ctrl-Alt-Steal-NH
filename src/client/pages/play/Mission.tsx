import confetti from "canvas-confetti";
import { useEffect } from "react";
import type { TeamView } from "../../../shared/protocol";
import { REVEAL_STEP, type RoundId } from "../../../shared/types";
import { ClueCard } from "../../components/Clue";
import { Leaderboard } from "../../components/Leaderboard";
import { Credits, Delta, ConfirmButton, HexCoin, errorText, useToast } from "../../components/ui";
import { buzz, formatCode, ordinal } from "../../lib/format";
import type { Act } from "../../lib/socket";
import { RoundPanel } from "./RoundPanel";

interface MissionProps {
  view: TeamView;
  act: Act;
  openCase: () => void;
}

export function Mission({ view, act, openCase }: MissionProps) {
  const { stage, roundId } = view.live;
  switch (stage) {
    case "lobby":
      return <Lobby view={view} />;
    case "briefing":
      return (
        <Waiting icon="📽️" title="Briefing in progress" text="Eyes on the big screen. The story, the suspects and the rules are being unsealed right now.">
          <button type="button" className="keycap mt-6" onClick={openCase}>
            Open the case file
          </button>
        </Waiting>
      );
    case "round":
      return roundId ? <RoundStage view={view} act={act} roundId={roundId} /> : null;
    case "leaderboard":
      return <Standings view={view} />;
    case "break":
      return <Waiting icon="☕" title="Break time" text="Stretch, grab chai, argue about the thief. The Vault opens when the timer ends." />;
    case "consolidation":
      return <Consolidation view={view} openCase={openCase} />;
    case "finalReveal":
      return <FinalReveal view={view} />;
    case "podium":
      return <Podium view={view} />;
  }
}

function Waiting({ icon, title, text, children }: { icon: string; title: string; text: string; children?: React.ReactNode }) {
  return (
    <section className="rise flex flex-col items-center px-2 pt-10 text-center">
      <div className="relative grid size-28 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-honey/30" />
        <span className="absolute inset-3 rounded-full border border-honey/20" />
        <span className="text-5xl">{icon}</span>
      </div>
      <h2 className="mt-6 font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-xs text-muted">{text}</p>
      {children}
    </section>
  );
}

function Lobby({ view }: { view: TeamView }) {
  const { team } = view.me;
  const present = view.teams.filter((t) => t.checkedIn).length;
  return (
    <section className="rise space-y-5">
      <div className={`panel overflow-hidden p-5 ${team.checkedIn ? "border-acid/40" : "border-alarm/50"}`}>
        {team.checkedIn ? (
          <>
            <p className="label text-acid">✓ Checked in</p>
            <h2 className="mt-2 font-display text-2xl font-bold">You're in, agents.</h2>
            <p className="mt-1 text-muted">Keep this page open. Everything updates live: rounds, timers, clues and your credits.</p>
          </>
        ) : (
          <>
            <p className="label text-alarm">Not checked in yet</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Head to the check-in desk.</h2>
            <p className="mt-1 text-muted">Show this code to a volunteer. You can't submit answers until you're checked in.</p>
            <p className="mt-4 text-center font-display text-4xl font-black tracking-widest text-honey">{formatCode(team.code)}</p>
          </>
        )}
      </div>
      <div className="panel p-5">
        <p className="label">Starting stack</p>
        <Credits value={view.me.credits} className="mt-2 text-4xl text-honey" />
        <p className="mt-2 text-sm text-muted">Every crew starts with the same credits. Earn, risk and bet them across four rounds.</p>
      </div>
      <p className="text-center text-sm text-muted">
        {present} crew{present === 1 ? "" : "s"} checked in · waiting for the briefing<span className="blink">_</span>
      </p>
    </section>
  );
}

function RoundStage({ view, act, roundId }: { view: TeamView; act: Act; roundId: RoundId }) {
  const status = view.status[roundId];
  const round = view.rounds[roundId];
  const result = view.me.results.find((r) => r.roundId === roundId);

  return (
    <section className="space-y-5">
      <header className="rise">
        <p className="label text-honey">
          {round.codename} · {status === "open" ? "Live" : status === "intro" ? "Get ready" : status === "locked" ? "Locked" : status === "revealed" ? "Revealed" : "Coming up"}
        </p>
        <h2 className="mt-1 font-display text-3xl font-black">{round.title}</h2>
        <p className="text-lg text-honey/90">“{round.tagline}”</p>
      </header>

      {status === "intro" && (
        <ol className="space-y-2">
          {round.howTo.map((line, i) => (
            <li key={line} className="panel flex gap-3 p-4 text-sm">
              <span className="font-mono text-honey">0{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
          <li className="pt-2 text-center text-sm text-muted">
            Answers open when the host starts the timer<span className="blink">_</span>
          </li>
        </ol>
      )}

      {status === "revealed" && result && <ResultCard rows={result.rows} delta={result.delta} pending={result.pending} />}
      {status === "revealed" && (roundId === "r1" || roundId === "r2" || roundId === "r3") && view.caseFile.clues[roundId] && <ClueCard clue={view.caseFile.clues[roundId]!} />}
      {roundId === "r4" && view.me.bonusClue && <ClueCard clue={view.me.bonusClue} tone="ice" />}
      {status === "locked" && (
        <div className="rounded-2xl border border-line bg-panel-2 p-4 text-center">
          <p className="font-semibold">🔒 Answers are locked.</p>
          <p className="text-sm text-muted">Watch the big screen for the reveal.</p>
        </div>
      )}

      {roundId === "r2" && (status === "open" || status === "locked" || status === "revealed") && <TrainingLog view={view} act={act} />}
      {status !== "intro" && status !== "pending" && <RoundPanel key={roundId} view={view} act={act} roundId={roundId} />}
    </section>
  );
}

function TrainingLog({ view, act }: { view: TeamView; act: Act }) {
  const toast = useToast();
  const round = view.rounds.r2;
  const bought = view.me.hints.r2 ?? [];
  const open = view.status.r2 === "open";
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-acid/30 bg-ink-2">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <span className="size-2 rounded-full bg-acid blink" />
          <span className="font-mono text-xs text-muted">queenbee_train.log</span>
        </div>
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[11px] leading-relaxed text-acid/90 [overflow-wrap:anywhere]">{round.log}</pre>
      </div>
      {round.hintCosts.length > 0 && (
        <div className="space-y-2">
          {bought.map((hint) => (
            <p key={hint.index} className="rounded-xl border border-ice/30 bg-ice/5 p-3 font-mono text-sm text-ice">
              &gt; HINT {hint.index + 1}: {hint.text}
            </p>
          ))}
          {open && (
            <div className="flex flex-wrap gap-2">
              {round.hintCosts.map((cost, index) =>
                bought.some((h) => h.index === index) ? null : (
                  <ConfirmButton
                    key={index}
                    className="keycap text-xs"
                    confirmLabel={`Spend ${cost}?`}
                    onConfirm={async () => {
                      try {
                        await act({ type: "hint.buy", roundId: "r2", index });
                      } catch (error) {
                        toast(errorText(error), "bad");
                      }
                    }}
                  >
                    💡 Hint {index + 1} · <HexCoin /> {cost}
                  </ConfirmButton>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ResultCard({ rows, delta, pending }: { rows: TeamView["me"]["results"][number]["rows"]; delta: number; pending: boolean }) {
  useEffect(() => {
    if (delta > 0 && !pending) confetti({ particleCount: 70, spread: 60, origin: { y: 0.3 }, colors: ["#ffb627", "#b6ff3b"] });
    if (delta !== 0) buzz(delta > 0 ? [20, 30, 20, 30, 60] : [200]);
  }, [delta, pending]);
  return (
    <div className={`rise panel overflow-hidden ${delta > 0 ? "border-acid/50" : delta < 0 ? "border-alarm/50" : ""}`}>
      <div className="flex items-center justify-between p-5">
        <div>
          <p className="label">This round</p>
          {pending ? <p className="mt-1 font-display text-2xl font-bold">Door still closed…</p> : <Delta value={delta} className="mt-1 block font-display text-4xl" />}
        </div>
        <span className="text-5xl">{pending ? "🚪" : delta > 0 ? "🤑" : delta < 0 ? "💸" : "😐"}</span>
      </div>
      <ul className="divide-y divide-line border-t border-line text-sm">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <span>
              <span className="font-semibold">{row.label}</span>
              <span className="block text-xs text-muted">{row.detail}</span>
            </span>
            {!row.pending && <Delta value={row.delta} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Standings({ view }: { view: TeamView }) {
  return (
    <section className="rise space-y-4">
      <div className="panel flex items-center justify-between p-5">
        <div>
          <p className="label">Your position</p>
          <p className="mt-1 font-display text-4xl font-black">{view.me.rank ? ordinal(view.me.rank) : "Classified"}</p>
        </div>
        <Credits value={view.me.credits} className="text-2xl text-honey" />
      </div>
      {view.standings ? (
        <Leaderboard standings={view.standings} teams={view.teams} highlight={view.me.team.id} />
      ) : (
        <p className="rounded-2xl border border-line bg-panel p-6 text-center text-muted">The leaderboard is blacked out. Trust your gut.</p>
      )}
    </section>
  );
}

function Consolidation({ view, openCase }: { view: TeamView; openCase: () => void }) {
  const clues = [view.caseFile.clues.r1, view.caseFile.clues.r2, view.caseFile.clues.r3].filter(Boolean);
  return (
    <section className="space-y-4">
      <header className="rise">
        <p className="label text-honey">Clue consolidation</p>
        <h2 className="mt-1 font-display text-3xl font-black">Connect the dots.</h2>
        <p className="mt-1 text-muted">Who, where, how. Use the Board tab to cross suspects off together. No hints from volunteers now.</p>
      </header>
      {clues.map((clue) => (
        <ClueCard key={clue!.title} clue={clue!} />
      ))}
      {view.me.bonusClue && <ClueCard clue={view.me.bonusClue} tone="ice" />}
      <button type="button" className="keycap w-full" onClick={openCase}>
        Re-read the full case file
      </button>
    </section>
  );
}

function FinalReveal({ view }: { view: TeamView }) {
  const step = view.live.revealStep;
  const { solution, reveal, suspects, locations, methods } = view.caseFile;
  const mine = view.me.subs.finale?.data;
  const result = view.me.results.find((r) => r.roundId === "finale");
  const parts = [
    { show: step >= REVEAL_STEP.thief, label: "The thief", truth: suspects.find((s) => s.id === solution.thiefId), mine: suspects.find((s) => s.id === mine?.thiefId), text: reveal.thief },
    { show: step >= REVEAL_STEP.location, label: "The hideout", truth: locations.find((l) => l.id === solution.locationId), mine: locations.find((l) => l.id === mine?.locationId), text: reveal.location },
    { show: step >= REVEAL_STEP.method, label: "The recovery", truth: methods.find((m) => m.id === solution.methodId), mine: methods.find((m) => m.id === mine?.methodId), text: reveal.method },
  ];
  return (
    <section className="space-y-4">
      <header className="rise text-center">
        <p className="label text-alarm">The reveal</p>
        <h2 className="mt-1 font-display text-3xl font-black">Case closing…</h2>
      </header>
      {parts.map((part) =>
        part.show && part.truth ? (
          <div key={part.label} className={`rise panel p-5 ${part.mine?.id === part.truth.id ? "border-acid/60" : "border-alarm/50"}`}>
            <p className="label">{part.label}</p>
            <p className="mt-2 font-display text-2xl font-bold">
              {part.truth.emoji} {part.truth.name}
            </p>
            <p className={`mt-1 text-sm font-semibold ${part.mine?.id === part.truth.id ? "text-acid" : "text-alarm"}`}>
              {part.mine ? (part.mine.id === part.truth.id ? "✓ You called it" : `✗ You said ${part.mine.name}`) : "✗ No answer"}
            </p>
            {part.text && <p className="mt-3 text-sm text-muted">{part.text}</p>}
          </div>
        ) : (
          <div key={part.label} className="rounded-2xl border border-dashed border-line-2 p-5 text-center text-muted">
            {part.label}: <span className="redact px-6">classified</span>
          </div>
        ),
      )}
      {result && !result.pending && <ResultCard rows={result.rows} delta={result.delta} pending={false} />}
      {reveal.epilogue && <p className="rise rounded-2xl bg-panel-2 p-5 text-center italic text-paper/80">{reveal.epilogue}</p>}
    </section>
  );
}

function Podium({ view }: { view: TeamView }) {
  const rank = view.me.rank;
  useEffect(() => {
    if (rank && rank <= 3) {
      const end = Date.now() + 2500;
      const frame = () => {
        confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#ffb627", "#b6ff3b", "#ff3b6b"] });
        confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#ffb627", "#5ce1ff"] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [rank]);
  return (
    <section className="rise space-y-5 text-center">
      <p className="label text-honey">Final standings</p>
      <p className="font-display text-7xl font-black">{rank ? ordinal(rank) : "—"}</p>
      <Credits value={view.me.credits} className="justify-center text-3xl text-honey" />
      {view.me.badges.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-4 text-left">
          {view.me.badges.map((badge) => (
            <div key={badge.id} className="panel p-4">
              <span className="text-3xl">{badge.emoji}</span>
              <p className="mt-2 font-display text-sm font-bold">{badge.name}</p>
              <p className="text-xs text-muted">{badge.why}</p>
            </div>
          ))}
        </div>
      )}
      <p className="pt-4 text-muted">Thanks for playing, agents. Follow Neural Hive for the next heist. 🐝</p>
    </section>
  );
}
