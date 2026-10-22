import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicView } from "../../../shared/protocol";
import { Boot } from "../../App";
import { Logo } from "../../components/Logo";
import { QrCode } from "../../components/QrCode";
import { readTimer, useNow } from "../../lib/clock";
import { joinUrl } from "../../lib/format";
import { enableSound, sfx } from "../../lib/sound";
import { useGame } from "../../lib/socket";
import { FinalReveal, Podium } from "./Reveal";
import { RoundScreen } from "./RoundScreen";
import { BreakScreen, BriefingScreen, ConsolidationScreen, LeaderboardScreen, LobbyScreen } from "./stages";

const W = 1920;
const H = 1080;
const HELLO = { t: "hello", role: "screen" } as const;

function useFitScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

export default function Screen() {
  const preview = new URLSearchParams(window.location.search).has("preview");
  const game = useGame(HELLO);
  const scale = useFitScale();
  const [armed, setArmed] = useState(preview);
  const now = useNow(game.offset, 200);
  const view = game.view?.kind === "public" ? game.view : null;

  useSoundCues(view, now, armed && !preview);

  if (!view) return <Boot text="Linking to the big screen…" />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink">
      <div className="absolute top-1/2 left-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <Frame view={view} now={now}>
          <StageSwitch view={view} now={now} />
        </Frame>
      </div>
      {game.status === "reconnecting" && <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-alarm px-4 py-1 text-sm font-bold text-white">Reconnecting…</p>}
      {!armed && (
        <button
          type="button"
          className="absolute inset-0 z-50 grid place-items-center bg-ink/85 backdrop-blur"
          onClick={() => {
            enableSound();
            sfx.go();
            setArmed(true);
            document.documentElement.requestFullscreen?.().catch(() => {});
          }}
        >
          <span className="text-center">
            <Logo size="lg" />
            <span className="mt-8 block font-display text-3xl font-bold">Click to go live</span>
            <span className="mt-2 block text-muted">Turns on sound and full screen. Press F11 if full screen doesn't stick.</span>
          </span>
        </button>
      )}
    </div>
  );
}

function StageSwitch({ view, now }: { view: PublicView; now: number }) {
  switch (view.live.stage) {
    case "lobby":
      return <LobbyScreen view={view} />;
    case "briefing":
      return <BriefingScreen view={view} />;
    case "round":
      return view.live.roundId ? <RoundScreen view={view} roundId={view.live.roundId} now={now} /> : null;
    case "leaderboard":
      return <LeaderboardScreen view={view} />;
    case "break":
      return <BreakScreen view={view} now={now} />;
    case "consolidation":
      return <ConsolidationScreen view={view} now={now} />;
    case "finalReveal":
      return <FinalReveal view={view} />;
    case "podium":
      return <Podium view={view} />;
  }
}

// ---------------------------------------------------------------- frame

const STAGE_LABEL: Record<string, string> = {
  lobby: "Check-in",
  briefing: "Briefing",
  leaderboard: "Leaderboard",
  break: "Break",
  consolidation: "Connect the dots",
  finalReveal: "The reveal",
  podium: "Winners",
};

function Frame({ view, now, children }: { view: PublicView; now: number; children: ReactNode }) {
  const { live } = view;
  const label = live.stage === "round" && live.roundId ? `${view.rounds[live.roundId].codename} · ${view.rounds[live.roundId].title}` : STAGE_LABEL[live.stage];
  const showAnnouncement = live.announcement && now - live.announcement.at < 25_000;
  const feed = [...view.feed].reverse().slice(0, 10);
  return (
    <div className="grain relative size-full overflow-hidden bg-ink text-paper">
      <div className="absolute inset-0 bg-hex opacity-70 [mask-image:radial-gradient(70%_70%_at_50%_40%,#000,transparent)]" />
      <div className="absolute -top-60 -left-60 size-[900px] rounded-full bg-honey/[0.07] blur-[160px]" />
      <div className="absolute -right-60 -bottom-60 size-[800px] rounded-full bg-alarm/[0.07] blur-[160px]" />

      <header className="absolute inset-x-0 top-0 z-20 flex h-[88px] items-center gap-8 px-12">
        <Logo size="md" />
        <span className="label text-[15px] text-honey">{label}</span>
        {live.stage !== "lobby" && (
          <span className="ml-auto flex items-center gap-4">
            <span className="text-right">
              <span className="label block text-[12px]">Join</span>
              <span className="font-mono text-[18px] font-bold">{joinUrl().replace(/^https?:\/\//, "")}</span>
            </span>
            <QrCode text={joinUrl()} size={64} className="rounded-md" />
          </span>
        )}
      </header>

      <main className="absolute inset-x-0 top-[88px] bottom-[64px] z-10 px-12 pt-4">{children}</main>

      <footer className="absolute inset-x-0 bottom-0 z-20 flex h-[64px] items-center overflow-hidden border-t border-line bg-ink/80">
        <span className="z-10 flex h-full shrink-0 items-center bg-alarm px-6 font-mono text-[15px] font-bold tracking-widest text-white">● LIVE</span>
        <div className="relative flex-1 overflow-hidden">
          {feed.length > 0 && (
            <div className="marquee whitespace-nowrap">
              {[0, 1].map((copy) => (
                <span key={copy} className="flex shrink-0">
                  {feed.map((item) => (
                    <span key={`${copy}-${item.id}`} className={`px-8 text-[20px] ${item.tone === "bad" ? "text-alarm" : item.tone === "good" ? "text-acid" : item.tone === "hype" ? "text-honey" : "text-paper/80"}`}>
                      {item.icon} {item.text}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          )}
        </div>
      </footer>

      {showAnnouncement && (
        <div className="rise absolute inset-x-0 top-[120px] z-30 mx-24">
          <div className="tape h-4 rounded-t-xl" />
          <div className="bg-honey px-12 py-8 text-center text-ink shadow-2xl">
            <p className="font-mono text-[16px] font-bold tracking-[0.3em]">📣 ANNOUNCEMENT</p>
            <p className="mt-2 font-display text-[48px] leading-tight font-black">{live.announcement!.text}</p>
          </div>
          <div className="tape h-4 rounded-b-xl" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sound

/** Plays sound effects when the game state changes in ways the room should hear. */
function useSoundCues(view: PublicView | null, now: number, on: boolean) {
  const prev = useRef<PublicView | null>(null);
  const lastSecond = useRef<number | null>(null);
  const reading = view ? readTimer(view.live.timer, now) : null;
  const second = reading && reading.running ? Math.ceil(reading.leftMs / 1000) : reading?.done ? 0 : null;

  useEffect(() => {
    if (!on || second === lastSecond.current) return;
    if (second !== null && second > 0 && second <= 10) (second <= 3 ? sfx.tock : sfx.tick)();
    if (second === 0 && lastSecond.current !== null && lastSecond.current > 0) sfx.buzzer();
    lastSecond.current = second;
  }, [second, on]);

  useEffect(() => {
    const before = prev.current;
    prev.current = view;
    if (!on || !view || !before) return;
    const { live } = view;
    const roundId = live.roundId;
    if (roundId && view.status[roundId] !== before.status[roundId]) {
      if (view.status[roundId] === "open") sfx.go();
      if (view.status[roundId] === "revealed" && roundId !== "r4") sfx.success();
    }
    const opened = live.vaultOpened.find((door) => !before.live.vaultOpened.includes(door));
    if (opened !== undefined) {
      const prize = view.rounds.r4.prizes[view.rounds.r4.opened[opened] ?? -1];
      if (!prize) sfx.whoosh();
      else if (prize.multiplier === 0) sfx.alarm();
      else if (prize.multiplier < 1) sfx.fail();
      else sfx.success();
    }
    if (live.stage === "finalReveal" && (before.live.stage !== "finalReveal" || live.revealStep !== before.live.revealStep) && live.revealStep >= 1 && live.revealStep <= 3) {
      sfx.drumroll(2.2);
    }
    if (live.stage === "podium" && before.live.stage !== "podium") sfx.fanfare();
    if (live.announcement && live.announcement.id !== before.live.announcement?.id) sfx.whoosh();
    if (live.stage === "lobby" && view.teams.filter((t) => t.checkedIn).length > before.teams.filter((t) => t.checkedIn).length) sfx.coin();
    const lockedNow = roundId ? view.stats.lockedIn[roundId].length : 0;
    const lockedBefore = roundId ? before.stats.lockedIn[roundId].length : 0;
    if (lockedNow > lockedBefore) sfx.tick();
  }, [view, on]);
}
