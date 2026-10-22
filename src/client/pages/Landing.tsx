import { useEffect, useState, type ReactNode } from "react";
import type { PublicInfo } from "../../shared/protocol";
import { Logo } from "../components/Logo";
import { HexCoin, TapeBand } from "../components/ui";
import { safeUrl, usePublicInfo } from "../lib/api";
import { linkTo } from "../lib/router";
import { CaseBoard, LineupArt, TerminalArt, TradingArt, VaultArt } from "./landing/Art";

const FALLBACK_STORY = [
  "Neural Hive's prize AI model has been stolen from the lab overnight. Whoever took it wiped the server and left a note.",
  "Teams of recovery agents have three hours to retrace the theft, test the evidence and name the thief before the trail goes cold.",
];

export default function Landing() {
  const { info } = usePublicInfo();
  const open = info?.event.registrationOpen ?? true;
  return (
    <div className="grain scanlines relative min-h-dvh overflow-x-clip">
      <TopBar registrationOpen={open} />
      <main>
        <Hero info={info} />
        <TapeBand text="Crime scene · do not cross · Neural Hive · Lab 404" className="-mx-4 -rotate-1 text-sm" />
        <Story info={info} />
        <Suspects info={info} />
        <Rounds info={info} />
        <Economy start={info?.event.startingCredits ?? 1000} />
        <Schedule />
        <Faq info={info} />
        <FinalCta registrationOpen={open} />
      </main>
      <Footer info={info} />
    </div>
  );
}

// ---------------------------------------------------------------- top bar

function TopBar({ registrationOpen }: { registrationOpen: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line/60 bg-ink/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6" aria-label="Main">
        <a href="/" onClick={linkTo("/")} className="shrink-0">
          <Logo size="sm" />
        </a>
        <div className="ml-6 hidden items-center gap-6 text-sm text-muted lg:flex">
          <a href="#heist" className="hover:text-paper">The heist</a>
          <a href="#rounds" className="hover:text-paper">Rounds</a>
          <a href="#credits" className="hover:text-paper">Credits</a>
          <a href="#schedule" className="hover:text-paper">Schedule</a>
          <a href="#faq" className="hover:text-paper">FAQ</a>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <a href="/play" onClick={linkTo("/play")} className="hidden text-sm font-semibold text-muted hover:text-paper sm:inline">
            Join game
          </a>
          {registrationOpen && (
            <a href="/register" onClick={linkTo("/register")} className="keycap keycap-honey text-xs">
              Register crew
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------- hero

function useCountdown(iso: string | undefined) {
  const target = iso ? Date.parse(iso) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(target)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (Number.isNaN(target) || target <= now) return null;
  const s = Math.floor((target - now) / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

function Hero({ info }: { info: PublicInfo | null }) {
  const event = info?.event;
  const countdown = useCountdown(event?.startsAt);
  const open = event?.registrationOpen ?? true;
  return (
    <section className="relative isolate overflow-hidden px-4 pt-28 pb-16 sm:px-6 md:pt-36 md:pb-24">
      <div className="absolute inset-0 -z-10 bg-hex [mask-image:radial-gradient(80%_70%_at_30%_30%,#000,transparent)]" />
      <div className="absolute -top-40 -left-40 -z-10 size-[700px] rounded-full bg-honey/10 blur-[120px]" />
      <div className="absolute right-[-10%] bottom-[-20%] -z-10 size-[520px] rounded-full bg-alarm/10 blur-[120px]" />
      <p className="pointer-events-none absolute right-[-4vw] top-[8vh] -z-10 font-display text-[34vw] leading-none font-black text-outline md:text-[26vw]" aria-hidden>
        404
      </p>

      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="label rise flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2 text-alarm">
              <span className="size-2 rounded-full bg-alarm blink" /> Case #NH-404
            </span>
            <span>Status: open</span>
            <span className="hidden sm:inline">{event?.club ?? "Neural Hive"} · {event?.university ?? "PES University"}</span>
          </p>
          <div className="rise mt-8 [animation-delay:80ms]">
            <Logo size="xl" animate />
          </div>
          <h1 className="rise mt-10 font-display text-[clamp(2.6rem,7.5vw,6.2rem)] leading-[0.92] font-black tracking-tight [animation-delay:160ms]">
            Someone stole
            <br />
            <span className="glitch text-honey" data-text="our AI.">
              our AI.
            </span>
          </h1>
          <p className="rise mt-6 max-w-xl text-lg text-muted sm:text-xl [animation-delay:240ms]">
            {event?.tagline ?? "The model is gone. The trail is warm. You have three hours."} Form a crew of 3–4 recovery agents, follow the clues,
            spot the deepfakes, and bet your credits on naming the thief.
          </p>
          <div className="rise mt-9 flex flex-wrap items-center gap-4 [animation-delay:320ms]">
            {open ? (
              <a href="/register" onClick={linkTo("/register")} className="keycap keycap-honey text-base">
                Register your crew →
              </a>
            ) : (
              <span className="keycap text-base opacity-70">Registration closed</span>
            )}
            <a href="/play" onClick={linkTo("/play")} className="keycap text-base">
              I have a team code
            </a>
          </div>

          <dl className="rise mt-12 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4 [animation-delay:400ms]">
            {[
              ["3 hrs", "of chaos"],
              ["4", "rounds + finale"],
              ["1", "thief"],
              [String(info?.teamCount ?? "—"), "crews signed up"],
            ].map(([big, small]) => (
              <div key={small} className="bg-panel px-4 py-3">
                <dt className="sr-only">{small}</dt>
                <dd className="font-display text-xl font-bold">{big}</dd>
                <dd className="text-xs text-muted">{small}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-5">
          <CaseBoard modelName={info?.modelName ?? "QUEENBEE"} />
        </div>
      </div>

      <div className="mx-auto mt-14 flex max-w-7xl flex-wrap items-center gap-3">
        <span className="chip">📅 {event?.dateText ?? "Date to be announced"}</span>
        <span className="chip">📍 {event?.venue ?? "Seminar Hall, PES University"}</span>
        {countdown && (
          <span className="chip border-honey/50 font-mono text-honey">
            ⏳ {countdown.days}d {String(countdown.hours).padStart(2, "0")}h {String(countdown.minutes).padStart(2, "0")}m{" "}
            {String(countdown.seconds).padStart(2, "0")}s
          </span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- story

/** Wraps words in a redaction bar that lifts on hover or tap. */
function Redacted({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      className={`redact px-1 ${open ? "is-open" : ""}`}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((o) => !o)}
      aria-label={open ? undefined : "Redacted text, tap to reveal"}
    >
      {children}
    </span>
  );
}

function Story({ info }: { info: PublicInfo | null }) {
  const story = info?.story.length ? info.story : FALLBACK_STORY;
  const facts = info?.facts ?? [];
  return (
    <section id="heist" className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 md:py-32 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="label text-alarm">Incident report</p>
        <h2 className="mt-4 font-display text-[clamp(2rem,5vw,3.6rem)] leading-[1] font-black">
          The night <Redacted>{info?.modelName ?? "QUEENBEE"}</Redacted> vanished.
        </h2>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-paper/85">
          {story.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
      <div className="lg:col-span-5">
        <div className="panel overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="size-3 rounded-full bg-alarm/80" />
            <span className="size-3 rounded-full bg-honey/80" />
            <span className="size-3 rounded-full bg-acid/80" />
            <span className="ml-3 font-mono text-xs text-muted">lab404/access.log</span>
          </div>
          <ol className="space-y-0 p-2 font-mono text-sm">
            {(facts.length ? facts : [{ time: "??:??", text: "Logs are classified until the briefing." }]).map((fact) => (
              <li key={fact.time + fact.text} className="grid grid-cols-[5.5rem_1fr] gap-3 rounded-lg px-3 py-2.5 hover:bg-panel-2">
                <span className="text-honey">{fact.time}</span>
                <span className="text-paper/80">{fact.text}</span>
              </li>
            ))}
            <li className="px-3 py-2 text-acid">
              $ <span className="blink">▌</span>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

function Suspects({ info }: { info: PublicInfo | null }) {
  const suspects = info?.suspects ?? [];
  if (!suspects.length) return null;
  return (
    <section className="relative overflow-hidden border-y border-line bg-ink-2 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] leading-none font-black">
            {suspects.length} suspects. <span className="text-alarm">1 thief.</span>
          </h2>
          <p className="max-w-sm text-muted">Full profiles are unsealed at the briefing. Until then, trust nobody. Especially the bot.</p>
        </div>
        <ul className="no-scrollbar mt-10 flex snap-x gap-4 overflow-x-auto pb-4">
          {suspects.map((s, i) => (
            <li key={s.id} className="group relative w-56 shrink-0 snap-start" style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
              <div className="panel panel-sharp overflow-hidden transition-transform duration-300 group-hover:-translate-y-2 group-hover:rotate-0">
                <div className="relative grid h-44 place-items-center bg-[repeating-linear-gradient(to_bottom,transparent_0_23px,rgb(255_255_255/0.06)_23px_24px)]">
                  <span className="text-7xl grayscale transition duration-300 group-hover:grayscale-0">{s.emoji}</span>
                  <span className="absolute top-2 left-2 font-mono text-[10px] text-dim">NO. {String(i + 1).padStart(3, "0")}</span>
                </div>
                <div className="border-t border-line p-4">
                  <p className="font-display font-bold">{s.name}</p>
                  <p className="text-sm text-honey">“{s.alias}”</p>
                  <p className="mt-1 text-xs text-muted">{s.role}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- rounds

const ROUND_COPY = {
  r1: { learn: "Prediction markets & signal vs. noise", art: <TradingArt />, span: "md:col-span-4" },
  r2: { learn: "Pattern recognition & codebreaking", art: <TerminalArt />, span: "md:col-span-2" },
  r3: { learn: "Deepfakes & generative AI tells", art: <LineupArt />, span: "md:col-span-2" },
  r4: { learn: "Risk, odds & expected value", art: <VaultArt />, span: "md:col-span-4" },
} as const;

const DEFAULT_ROUNDS: PublicInfo["rounds"] = [
  { id: "r1", codename: "Round 1", title: "The Trading Floor", tagline: "Invest in the right lead.", durationSec: 600 },
  { id: "r2", codename: "Round 2", title: "The Training Log", tagline: "Decode the pattern.", durationSec: 900 },
  { id: "r3", codename: "Round 3", title: "The Lineup", tagline: "Real or fake?", durationSec: 720 },
  { id: "r4", codename: "Round 4", title: "The Vault", tagline: "Risk it or bank it.", durationSec: 420 },
  { id: "finale", codename: "Finale", title: "Name the Thief", tagline: "One answer. One bet.", durationSec: 480 },
];

function Rounds({ info }: { info: PublicInfo | null }) {
  const rounds = info?.rounds ?? DEFAULT_ROUNDS;
  const finale = rounds.find((r) => r.id === "finale");
  return (
    <section id="rounds" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
      <p className="label">The job</p>
      <h2 className="mt-4 max-w-3xl font-display text-[clamp(2rem,5vw,3.6rem)] leading-[1] font-black">
        Four rounds. Zero coding required. <span className="text-honey">All AI.</span>
      </h2>
      <div className="mt-12 grid gap-4 md:grid-cols-6">
        {rounds
          .filter((r) => r.id !== "finale")
          .map((round, index) => {
            const copy = ROUND_COPY[round.id as keyof typeof ROUND_COPY];
            return (
              <article key={round.id} className={`panel group relative overflow-hidden p-6 transition hover:border-honey/50 ${copy?.span ?? "md:col-span-3"}`}>
                <span className="pointer-events-none absolute -top-6 -right-2 font-display text-[9rem] leading-none font-black text-outline transition group-hover:[-webkit-text-stroke-color:rgb(255_182_39/0.35)]">
                  {index + 1}
                </span>
                <p className="label">
                  {round.codename} · {Math.round(round.durationSec / 60)} min
                </p>
                <h3 className="mt-3 font-display text-2xl font-bold">{round.title}</h3>
                <p className="mt-1 text-lg text-honey">“{round.tagline}”</p>
                <div className="mt-6">{copy?.art}</div>
                <p className="mt-6 text-sm text-muted">
                  <span className="text-paper">You'll learn:</span> {copy?.learn}
                </p>
              </article>
            );
          })}
        {finale && (
          <article className="relative overflow-hidden rounded-[18px] border border-alarm/40 bg-gradient-to-br from-alarm/20 via-panel to-panel p-8 md:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="label text-alarm">{finale.codename}</p>
                <h3 className="mt-2 font-display text-3xl font-black md:text-4xl">{finale.title}</h3>
                <p className="mt-2 max-w-xl text-muted">
                  Pool every clue. Name the thief, the hiding place and the recovery plan. Then bet as much of your credits as you dare. Right answers
                  multiply the bet. Wrong ones burn it.
                </p>
              </div>
              <span className="stamp text-2xl text-alarm md:text-3xl">All in?</span>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- economy

function Economy({ start }: { start: number }) {
  const steps = [
    { k: "Start", v: `${start.toLocaleString("en-IN")} credits`, d: "Every crew gets the same stack." },
    { k: "Earn", v: "Win rounds", d: "Smart bets and sharp eyes pay." },
    { k: "Spend", v: "Buy hints", d: "Stuck? Intel costs credits." },
    { k: "Risk", v: "Crack the vault", d: "Gamble for a bonus clue." },
    { k: "Bet", v: "Final answer", d: "Most credits at the end wins." },
  ];
  return (
    <section id="credits" className="relative overflow-hidden border-y border-line bg-ink-2 px-4 py-24 sm:px-6">
      <div className="absolute inset-0 bg-hex opacity-60 [mask-image:linear-gradient(90deg,transparent,#000_30%,#000_70%,transparent)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center gap-6">
          <HexCoin className="size-16 drop-shadow-[0_0_30px_rgb(255_182_39/0.5)]" />
          <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] leading-none font-black">
            Compute Credits are <span className="text-honey">everything.</span>
          </h2>
        </div>
        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, i) => (
            <li key={step.k} className="panel relative p-5">
              <span className="font-mono text-xs text-honey">0{i + 1} · {step.k}</span>
              <p className="mt-3 font-display text-lg font-bold">{step.v}</p>
              <p className="mt-1 text-sm text-muted">{step.d}</p>
              {i < steps.length - 1 && <span className="absolute top-1/2 -right-3 z-10 hidden -translate-y-1/2 text-honey lg:block">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-2xl text-muted">
          Ranking is decided by credits after the final bet, not by who answers first. So the result stays open right up to the reveal.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- schedule

const SCHEDULE: [string, string, string][] = [
  ["0:00", "Check-in", "Show your team code at the desk and grab a seat."],
  ["0:15", "Briefing", "The story, the suspects and the rules."],
  ["0:25", "The Trading Floor", "Bet on the leads you believe."],
  ["0:50", "The Training Log", "Decode the corrupted log."],
  ["1:15", "The Lineup", "Spot the AI-made evidence."],
  ["1:40", "Break", "Chai, snacks, wild theories."],
  ["1:50", "The Vault", "Risk it or bank it."],
  ["2:10", "Connect the dots", "Your crew pieces it all together."],
  ["2:25", "Name the Thief", "Final answer. Final bet."],
  ["2:37", "The Reveal", "Who did it, and who got rich."],
  ["2:47", "Winners", "Prizes, photos, bragging rights."],
];

function Schedule() {
  return (
    <section id="schedule" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="label">Run of show</p>
          <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-none font-black">Three hours. No pause button.</h2>
          <p className="mt-6 text-muted">Every round runs on a countdown on the big screen. When the timer hits zero, answers lock automatically.</p>
        </div>
        <ol className="relative lg:col-span-8">
          <span className="absolute top-2 bottom-2 left-[4.25rem] w-px bg-gradient-to-b from-honey via-line-2 to-alarm" aria-hidden />
          {SCHEDULE.map(([time, title, detail]) => (
            <li key={time} className="group relative grid grid-cols-[4rem_1fr] gap-6 py-3">
              <span className="pt-0.5 text-right font-mono text-sm text-honey">{time}</span>
              <div className="relative">
                <span className="absolute top-2 -left-[1.95rem] size-2.5 rounded-full border-2 border-ink bg-honey transition group-hover:scale-150" />
                <p className="font-display font-bold">{title}</p>
                <p className="text-sm text-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- FAQ

function Faq({ info }: { info: PublicInfo | null }) {
  const min = info?.event.minMembers ?? 3;
  const max = info?.event.maxMembers ?? 4;
  const items: [string, string][] = [
    ["Do I need to know AI or coding?", "Not at all. Every round is built around an AI idea, but you only need curiosity, logic and a good eye. You'll walk out knowing how to spot a deepfake."],
    ["How big is a team?", `${min === max ? min : `${min} to ${max}`} people. Register once as a crew and you'll get a team code. Bring it to the check-in desk.`],
    ["What do I need to bring?", "At least one charged phone per crew to play on, and your team code. Everything else happens on the big screen and on your phone."],
    ["Can we use ChatGPT or Google during rounds?", "No. Phones are for the game console only. Yes, we see the irony. Volunteers will be watching, and answer sharing between crews gets you disqualified."],
    ["What if the Wi-Fi dies?", "We have paper slips ready. Hand your answers to a volunteer and they go straight into the system. Nothing is lost."],
    ["How is the winner decided?", "The crew with the most Compute Credits after the final bet wins. Speed only matters for one small bonus in Round 2."],
  ];
  return (
    <section id="faq" className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
      <p className="label">FAQ</p>
      <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-none font-black">Before you ask.</h2>
      <div className="mt-10 divide-y divide-line border-y border-line">
        {items.map(([q, a]) => (
          <details key={q} className="group py-5">
            <summary className="flex items-center justify-between gap-6 text-lg font-semibold">
              {q}
              <span className="keycap shrink-0 text-xs transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-2xl text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta({ registrationOpen }: { registrationOpen: boolean }) {
  return (
    <section className="relative overflow-hidden px-4 py-28 text-center sm:px-6">
      <div className="absolute inset-0 -z-10 bg-hex glow-honey" />
      <h2 className="font-display text-[clamp(2.4rem,7vw,5.5rem)] leading-[0.95] font-black">
        The trail is
        <br />
        <span className="glitch text-honey" data-text="going cold.">
          going cold.
        </span>
      </h2>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        {registrationOpen ? (
          <a href="/register" onClick={linkTo("/register")} className="keycap keycap-honey text-lg">
            Register your crew →
          </a>
        ) : (
          <span className="keycap text-lg opacity-70">Registration closed</span>
        )}
      </div>
    </section>
  );
}

function Footer({ info }: { info: PublicInfo | null }) {
  const instagram = info?.event.instagram ? safeUrl(info.event.instagram) : undefined;
  return (
    <footer className="border-t border-line px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 text-sm text-muted">
        <div className="flex items-center gap-4">
          <span className="text-2xl">🐝</span>
          <span>
            Made by <span className="text-paper">{info?.event.club ?? "Neural Hive"}</span>, {info?.event.university ?? "PES University"}
          </span>
        </div>
        <div className="flex items-center gap-5">
          {instagram && (
            <a href={instagram} target="_blank" rel="noopener noreferrer" className="hover:text-paper">
              Instagram ↗
            </a>
          )}
          {info?.event.contact && <span>{info.event.contact}</span>}
          <a href="/screen" onClick={linkTo("/screen")} className="hover:text-paper">
            Big screen
          </a>
          <a href="/admin" onClick={linkTo("/admin")} className="hover:text-paper">
            Organisers
          </a>
        </div>
      </div>
    </footer>
  );
}
