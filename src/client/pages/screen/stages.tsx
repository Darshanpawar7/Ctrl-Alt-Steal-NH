import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { PublicView } from "../../../shared/protocol";
import { Leaderboard } from "../../components/Leaderboard";
import { Logo } from "../../components/Logo";
import { QrCode } from "../../components/QrCode";
import { TimerRing } from "../../components/Timer";
import { HexCoin } from "../../components/ui";
import { joinUrl } from "../../lib/format";

// ---------------------------------------------------------------- lobby

export function LobbyScreen({ view }: { view: PublicView }) {
  const teams = view.teams.filter((t) => !t.disqualified);
  const present = teams.filter((t) => t.checkedIn);
  const url = joinUrl();
  return (
    <div className="grid h-full grid-cols-[760px_1fr] gap-16 pt-6">
      <section className="flex flex-col">
        <Logo size="xl" animate />
        <h1 className="mt-10 font-display text-[88px] leading-[0.95] font-black">
          Recovery crews,
          <br />
          <span className="glitch text-honey" data-text="report in.">
            report in.
          </span>
        </h1>
        <div className="mt-10 flex items-center gap-10">
          <div className="rounded-3xl bg-paper p-4 shadow-[0_0_80px] shadow-honey/25">
            <QrCode text={url} size={300} />
          </div>
          <ol className="space-y-5 text-[26px]">
            <li>
              <span className="mr-3 font-mono text-honey">01</span>Scan or open
              <span className="mt-1 block font-mono text-[24px] font-bold text-honey">{url.replace(/^https?:\/\//, "")}</span>
            </li>
            <li>
              <span className="mr-3 font-mono text-honey">02</span>Enter your crew code
            </li>
            <li>
              <span className="mr-3 font-mono text-honey">03</span>Check in at the desk
            </li>
          </ol>
        </div>
      </section>

      <section className="flex min-h-0 flex-col">
        <div className="flex items-end justify-between">
          <p className="label text-[16px]">Crews on site</p>
          <p className="font-display text-[56px] leading-none font-black">
            <span className="text-honey">{present.length}</span>
            <span className="text-dim"> / {teams.length}</span>
          </p>
        </div>
        <ul className="mt-6 grid min-h-0 flex-1 grid-cols-3 content-start gap-3 overflow-hidden">
          <AnimatePresence>
            {teams.map((team) => (
              <motion.li
                layout
                key={team.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-500 ${
                  team.checkedIn ? "border-honey/60 bg-honey/10" : "border-line bg-panel opacity-40"
                }`}
              >
                <span className="text-[34px]">{team.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[22px] font-semibold">{team.name}</span>
                {team.checkedIn && <span className="text-[20px] text-acid">✓</span>}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- briefing

export function BriefingScreen({ view }: { view: PublicView }) {
  const c = view.caseFile;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-12">
        <div className="flex-1">
          <p className="inline-flex items-center gap-3 rounded-md bg-alarm px-4 py-1.5 font-mono text-[18px] font-bold tracking-widest text-white">
            <span className="size-3 rounded-full bg-white blink" /> BREAKING
          </p>
          <h1 className="mt-5 font-display text-[64px] leading-[1] font-black">{c.headline}</h1>
          <div className="mt-6 space-y-4 text-[24px] leading-snug text-paper/85">
            {c.story.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
        <ol className="w-[600px] shrink-0 overflow-hidden rounded-2xl border border-line bg-ink-2 font-mono">
          <li className="border-b border-line px-5 py-3 text-[15px] text-muted">lab404/access.log</li>
          {c.facts.map((f) => (
            <li key={f.time + f.text} className="grid grid-cols-[120px_1fr] gap-3 border-b border-line/60 px-5 py-3 text-[19px] last:border-0">
              <span className="text-honey">{f.time}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <ul className="mt-auto grid grid-cols-6 gap-4">
        {c.suspects.map((s) => (
          <li key={s.id} className="panel panel-sharp p-4">
            <div className="flex items-center gap-3">
              <span className="text-[44px]">{s.emoji}</span>
              <span className="min-w-0">
                <span className="block font-display text-[18px] leading-tight font-bold">{s.name}</span>
                <span className="block truncate text-[16px] text-honey">“{s.alias}”</span>
              </span>
            </div>
            <ul className="mt-3 space-y-1 text-[14px] leading-snug text-paper/75">
              {s.traits.map((t) => (
                <li key={t}>· {t}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- leaderboard

export function LeaderboardScreen({ view }: { view: PublicView }) {
  if (!view.standings) return <Classified />;
  const rows = view.standings;
  const split = rows.length > 9;
  const left = split ? rows.slice(0, Math.ceil(Math.min(rows.length, 18) / 2)) : rows;
  const right = split ? rows.slice(left.length, 18) : [];
  return (
    <div className="flex h-full flex-col">
      <h1 className="font-display text-[72px] leading-none font-black">
        The <span className="text-honey">leaderboard</span>
      </h1>
      <div className={`mt-8 grid min-h-0 flex-1 gap-6 ${split ? "grid-cols-2" : "mx-auto w-[1100px] grid-cols-1"}`}>
        <Leaderboard standings={left} teams={view.teams} big />
        {split && <Leaderboard standings={right} teams={view.teams} big />}
      </div>
    </div>
  );
}

function Classified() {
  return (
    <div className="grid h-full place-items-center text-center">
      <div>
        <p className="label text-[20px] text-alarm">Leaderboard status</p>
        <h1 className="mt-6 font-display text-[120px] leading-none font-black">
          <span className="redact px-6">CLASSIFIED</span>
        </h1>
        <p className="mt-8 text-[30px] text-muted">Rankings stay sealed until the reveal. Bet like you mean it.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- break

const AI_FACTS = [
  "Deepfake tell: check ears, teeth and earrings. Image generators still fumble small, symmetric details.",
  "Chatbot tell: replies that open with “Great question!” and close with a tidy little summary.",
  "AI-written text is evenly confident, oddly formal, and never uses slang at 3 AM.",
  "A prediction market turns lots of guesses into one probability. The Trading Floor was a tiny one.",
  "Watermarking hides invisible statistical patterns in AI output so it can be identified later.",
  "Overfitting means memorising the training data instead of learning the pattern. Great for exams, terrible for models.",
  "Expected value = chance × payout. Before you walk into a vault, do the maths.",
  "Julius Caesar shifted letters by 3. Two thousand years later, people still fall for it.",
];

export function BreakScreen({ view, now }: { view: PublicView; now: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % AI_FACTS.length), 12_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="grid h-full grid-cols-[1fr_560px] items-center gap-16">
      <div>
        <p className="label text-[20px] text-honey">Break · chai o'clock</p>
        <h1 className="mt-4 font-display text-[110px] leading-[0.9] font-black">
          Back in
          <br />a minute.
        </h1>
        <div className="mt-14 min-h-[220px] rounded-3xl border border-line bg-panel p-10">
          <p className="label text-[16px]">Did you know</p>
          <AnimatePresence mode="wait">
            <motion.p key={index} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="mt-4 text-[36px] leading-snug">
              {AI_FACTS[index]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <TimerRing timer={view.live.timer} now={now} size={520} />
    </div>
  );
}

// ---------------------------------------------------------------- consolidation

export function ConsolidationScreen({ view, now }: { view: PublicView; now: number }) {
  const c = view.caseFile;
  const clues = [c.clues.r1, c.clues.r2, c.clues.r3].filter(Boolean);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-10">
        <div>
          <p className="label text-[20px] text-honey">Clue consolidation</p>
          <h1 className="mt-3 font-display text-[84px] leading-[0.95] font-black">
            Connect
            <br />
            the dots.
          </h1>
          <p className="mt-5 max-w-[760px] text-[26px] text-muted">Who took it? Where is it? How do we get it back? Volunteers can't help you now.</p>
        </div>
        <TimerRing timer={view.live.timer} now={now} size={330} />
      </div>
      <div className="mt-auto grid grid-cols-3 gap-5">
        {clues.map((clue) => (
          <article key={clue!.title} className="rounded-2xl border border-honey/40 bg-gradient-to-b from-honey/10 to-panel p-6">
            <p className="font-display text-[22px] font-bold text-honey">{clue!.title}</p>
            <p className="mt-3 text-[19px] leading-snug text-paper/90">{clue!.text}</p>
          </article>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3 text-[18px] text-muted">
        <HexCoin className="size-6" /> Crews who won the Vault have a bonus clue on their phones.
      </div>
    </div>
  );
}
