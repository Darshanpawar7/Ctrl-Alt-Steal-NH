import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect } from "react";
import type { PublicView } from "../../../shared/protocol";
import { REVEAL_STEP, type Option } from "../../../shared/types";
import { Leaderboard } from "../../components/Leaderboard";
import { Delta, HexCoin, Stamp, Ticker } from "../../components/ui";
import { credits } from "../../lib/format";

/** Holds the answer back for a drumroll before it lands. */
const DRUMROLL_S = 2.2;

export function FinalReveal({ view }: { view: PublicView }) {
  const step = view.live.revealStep;
  const c = view.caseFile;
  const picks = view.stats.finalePicks;

  if (step === REVEAL_STEP.locked) {
    const crews = view.stats.submitted.finale.length;
    return (
      <div className="grid h-full place-items-center text-center">
        <div>
          <p className="label text-[22px] text-alarm">All answers are locked</p>
          <h1 className="mt-6 font-display text-[120px] leading-[0.9] font-black">
            The truth
            <br />
            <span className="glitch text-honey" data-text="comes out now.">
              comes out now.
            </span>
          </h1>
          <p className="mt-12 flex items-center justify-center gap-4 text-[40px]">
            <HexCoin className="size-12" />
            <b className="font-mono text-honey">{credits(picks?.potTotal ?? 0)}</b> credits bet by {crews} crews
          </p>
        </div>
      </div>
    );
  }

  if (step <= REVEAL_STEP.method) {
    const config =
      step === REVEAL_STEP.thief
        ? { title: "The thief is…", options: c.suspects.map((s) => ({ ...s, detail: `“${s.alias}”` }) as Option), truth: c.solution.thiefId, counts: picks?.thief, story: c.reveal.thief, cols: 6 }
        : step === REVEAL_STEP.location
          ? { title: "QUEENBEE is hidden in…", options: c.locations, truth: c.solution.locationId, counts: picks?.location, story: c.reveal.location, cols: 6 }
          : { title: "And the way back is…", options: c.methods, truth: c.solution.methodId, counts: picks?.method, story: c.reveal.method, cols: 4 };
    return <RevealPart key={step} {...config} />;
  }

  if (step === REVEAL_STEP.epilogue) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-[1400px] text-center">
          <Stamp tone="acid" className="text-[56px]">Case closed</Stamp>
          <p className="rise mt-14 text-[44px] leading-snug">{c.reveal.epilogue}</p>
        </div>
      </div>
    );
  }

  return <FinalStandings view={view} />;
}

interface RevealPartProps {
  title: string;
  options: Option[];
  truth?: string;
  counts?: Record<string, number>;
  story?: string;
  cols: number;
}

function RevealPart({ title, options, truth, counts, story, cols }: RevealPartProps) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="flex h-full flex-col">
      <h1 className="font-display text-[84px] leading-none font-black">{title}</h1>
      <ul className="mt-10 grid gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const isTruth = option.id === truth;
          const votes = counts?.[option.id] ?? 0;
          return (
            <motion.li
              key={option.id}
              initial={{ opacity: 1, scale: 1 }}
              animate={isTruth ? { scale: [1, 1, 1.08], opacity: 1 } : { opacity: [1, 1, 0.25], scale: [1, 1, 0.95] }}
              transition={{ duration: DRUMROLL_S + 0.6, times: [0, DRUMROLL_S / (DRUMROLL_S + 0.6), 1] }}
              className={`relative rounded-2xl border-4 bg-panel p-6 text-center ${isTruth ? "border-honey" : "border-line"}`}
            >
              <p className="text-[84px] leading-none">{option.emoji}</p>
              <p className="mt-4 font-display text-[24px] leading-tight font-bold">{option.name}</p>
              {option.detail && cols === 6 && <p className="mt-1 text-[17px] text-muted">{option.detail}</p>}
              <p className="mt-4 font-mono text-[20px] text-muted">
                {votes} crew{votes === 1 ? "" : "s"}
                {total > 0 && <span className="text-dim"> · {Math.round((votes / total) * 100)}%</span>}
              </p>
              {isTruth && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: DRUMROLL_S }} className="absolute -top-6 left-1/2 -translate-x-1/2">
                  <Stamp tone="alarm" className="bg-ink text-[30px]">
                    Confirmed
                  </Stamp>
                </motion.span>
              )}
            </motion.li>
          );
        })}
      </ul>
      {story && (
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: DRUMROLL_S + 0.4 }} className="mt-auto rounded-2xl border border-line bg-panel p-8 text-[30px] leading-snug">
          {story}
        </motion.p>
      )}
    </div>
  );
}

function FinalStandings({ view }: { view: PublicView }) {
  const results = new Map((view.stats.finaleResults ?? []).map((r) => [r.teamId, r]));
  const byId = new Map(view.teams.map((t) => [t.id, t]));
  const standings = view.standings ?? [];
  return (
    <div className="flex h-full flex-col">
      <h1 className="font-display text-[72px] leading-none font-black">
        Final <span className="text-honey">standings</span>
      </h1>
      <div className="mt-8 grid min-h-0 flex-1 grid-cols-[1fr_620px] gap-8">
        <Leaderboard standings={standings.slice(0, 9)} teams={view.teams} big />
        <ul className="space-y-2 overflow-hidden">
          {standings.slice(0, 12).map((s) => {
            const r = results.get(s.teamId);
            return (
              <li key={s.teamId} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 text-[20px]">
                <span>{byId.get(s.teamId)?.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{byId.get(s.teamId)?.name}</span>
                <span className="font-mono text-[16px] text-muted">{r ? `${r.correct}/3 · bet ${credits(r.bet)}` : "no answer"}</span>
                <Delta value={r?.delta ?? 0} className="w-28 text-right" />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- podium

const PLACES = [
  { place: 2, height: 290, color: "#d9dce6", delay: 0.6 },
  { place: 1, height: 390, color: "var(--color-honey)", delay: 1.4 },
  { place: 3, height: 210, color: "#e0915a", delay: 0.2 },
];

export function Podium({ view }: { view: PublicView }) {
  const standings = view.standings ?? [];
  const byId = new Map(view.teams.map((t) => [t.id, t]));
  const badges = view.badges ?? {};

  useEffect(() => {
    const end = Date.now() + 4000;
    let frame = 0;
    const burst = () => {
      confetti({ particleCount: 8, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: ["#ffb627", "#b6ff3b", "#ff3b6b", "#5ce1ff"] });
      confetti({ particleCount: 8, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: ["#ffb627", "#b6ff3b", "#ff3b6b", "#5ce1ff"] });
      if (Date.now() < end) frame = requestAnimationFrame(burst);
    };
    const id = window.setTimeout(burst, 1600);
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Group badges by type so the wall reads "Deepfake Hunter: crew A, crew B".
  const wall = new Map<string, { emoji: string; name: string; why: string; teams: string[] }>();
  for (const [teamId, list] of Object.entries(badges)) {
    for (const b of list) {
      const entry = wall.get(b.id) ?? { emoji: b.emoji, name: b.name, why: b.why, teams: [] };
      entry.teams.push(`${byId.get(teamId)?.emoji ?? ""} ${byId.get(teamId)?.name ?? ""}`);
      wall.set(b.id, entry);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[600px] items-end justify-center gap-6">
        {PLACES.map(({ place, height, color, delay }) => {
          const standing = standings.find((s) => s.rank === place) ?? standings[place - 1];
          const team = standing ? byId.get(standing.teamId) : undefined;
          return (
            <div key={place} className="flex w-[400px] flex-col items-center">
              {team && standing && (
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 0.5 }} className="mb-5 text-center">
                  <p className="text-[86px] leading-none">{team.emoji}</p>
                  <p className="mt-3 max-w-[400px] truncate font-display text-[32px] font-black">{team.name}</p>
                  <p className="mt-1 flex items-center justify-center gap-2 font-mono text-[28px] font-bold text-honey">
                    <HexCoin /> <Ticker value={standing.credits} />
                  </p>
                </motion.div>
              )}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height }}
                transition={{ delay, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-full overflow-hidden rounded-t-3xl"
                style={{ background: `linear-gradient(180deg, ${color}, color-mix(in oklab, ${color} 45%, #07060b))` }}
              >
                <span className="absolute inset-x-0 top-5 text-center font-display text-[120px] leading-none font-black text-ink/80">{place}</span>
              </motion.div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-4 gap-4">
        {[...wall.values()].slice(0, 8).map((b) => (
          <div key={b.name} className="rounded-2xl border border-line bg-panel p-4">
            <p className="flex items-center gap-3">
              <span className="text-[36px]">{b.emoji}</span>
              <span className="font-display text-[20px] font-bold">{b.name}</span>
            </p>
            <p className="mt-2 truncate text-[16px] text-muted">{b.teams.join(", ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
