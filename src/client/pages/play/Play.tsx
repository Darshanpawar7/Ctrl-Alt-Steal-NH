import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TeamView } from "../../../shared/protocol";
import { Boot } from "../../App";
import { Logo } from "../../components/Logo";
import { TimerBar } from "../../components/Timer";
import { Credits, TapeBand } from "../../components/ui";
import { readTimer, useNow } from "../../lib/clock";
import { buzz } from "../../lib/format";
import { linkTo } from "../../lib/router";
import { useGame, type Act } from "../../lib/socket";
import { Board, CaseFile } from "./CaseFile";
import { Mission } from "./Mission";

const CODE_KEY = "cas:team-code";

function readStoredCode(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("code");
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeCode(code: string | null) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    // Private mode: the team just types the code again next time.
  }
}

export default function Play() {
  const [code, setCode] = useState(readStoredCode);
  const game = useGame(code ? { t: "hello", role: "team", code } : null);

  useEffect(() => {
    if (game.status === "live" && code) {
      storeCode(code);
      if (window.location.search) window.history.replaceState(null, "", "/play");
    }
  }, [game.status, code]);

  const failed = game.status === "denied" || game.status === "kicked";
  if (!code || failed) {
    return (
      <Login
        error={failed ? game.error : null}
        initial={failed ? "" : code}
        onSubmit={(next) => {
          storeCode(null);
          setCode(next);
        }}
      />
    );
  }
  if (!game.view || game.view.kind !== "team") return <Boot text="Connecting to HQ…" />;
  return (
    <Console
      view={game.view}
      act={game.act}
      offset={game.offset}
      reconnecting={game.status === "reconnecting"}
      onSignOut={() => {
        storeCode(null);
        setCode("");
      }}
    />
  );
}

// ---------------------------------------------------------------- login

function Login({ error, initial, onSubmit }: { error: string | null; initial: string; onSubmit: (code: string) => void }) {
  const [value, setValue] = useState(initial);
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (clean.length === 6) onSubmit(clean);
  }
  return (
    <main className="grain flex min-h-dvh flex-col bg-hex px-5 py-8">
      <a href="/" onClick={linkTo("/")} className="self-start">
        <Logo size="sm" />
      </a>
      <form onSubmit={handleSubmit} className="mx-auto my-auto w-full max-w-sm">
        <p className="label text-honey">Agent console</p>
        <h1 className="mt-2 font-display text-4xl font-black leading-none">Enter your crew code.</h1>
        <p className="mt-3 text-muted">It's on your registration screen and your code card. Six characters.</p>
        <label className="relative mt-8 block">
          <span className="sr-only">Team code</span>
          <input
            className="absolute inset-0 z-10 opacity-0"
            value={clean}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={7}
          />
          <span className="grid grid-cols-6 gap-2" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`keycap aspect-[4/5] p-0 text-2xl ${clean[i] ? "keycap-honey" : ""} ${i === clean.length ? "ring-2 ring-honey/60" : ""}`}>
                {clean[i] ?? ""}
              </span>
            ))}
          </span>
        </label>
        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-alarm/40 bg-alarm/10 px-4 py-3 text-sm text-alarm">
            {error}
          </p>
        )}
        <button type="submit" className="keycap keycap-honey mt-8 w-full text-lg" disabled={clean.length !== 6}>
          Jack in →
        </button>
        <p className="mt-6 text-center text-sm text-muted">
          No code yet?{" "}
          <a href="/register" onClick={linkTo("/register")} className="font-semibold text-honey underline-offset-4 hover:underline">
            Register your crew
          </a>
        </p>
      </form>
    </main>
  );
}

// ---------------------------------------------------------------- console

type Tab = "mission" | "case" | "board";

function useTimerBuzz(view: TeamView, now: number) {
  const last = useRef<number | null>(null);
  const reading = readTimer(view.live.timer, now);
  useEffect(() => {
    const seconds = Math.ceil(reading.leftMs / 1000);
    if (reading.running && seconds === 10 && last.current !== 10) buzz([60, 60, 60]);
    if (reading.done && last.current !== 0) buzz(400);
    last.current = reading.done ? 0 : seconds;
  }, [reading.leftMs, reading.running, reading.done]);
}

function Console({ view, act, offset, reconnecting, onSignOut }: { view: TeamView; act: Act; offset: number; reconnecting: boolean; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("mission");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const now = useNow(offset, 250);
  useTimerBuzz(view, now);

  const clueCount = Object.keys(view.caseFile.clues).length + (view.me.bonusClue ? 1 : 0);
  const seenClues = useRef(clueCount);
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    if (clueCount > seenClues.current) setUnseen(true);
    seenClues.current = clueCount;
  }, [clueCount]);

  // Jump back to the live tab whenever the host moves the game on.
  const marker = `${view.live.stage}:${view.live.roundId}:${view.live.roundId ? view.status[view.live.roundId] : ""}`;
  useEffect(() => setTab("mission"), [marker]);

  const { team } = view.me;
  const announcement = view.live.announcement;
  const timerActive = !readTimer(view.live.timer, now).idle;

  return (
    <div className="grain min-h-dvh bg-ink pb-28">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-2 bg-panel-2 text-2xl">{team.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold">{team.name}</p>
            <p className="font-mono text-[11px] text-muted">
              {view.me.rank ? `Rank #${view.me.rank}` : view.standings ? "Unranked" : "Rank hidden"} · {team.checkedIn ? "checked in" : "not checked in"}
            </p>
          </div>
          <Credits value={view.me.credits} className="rounded-xl border border-honey/30 bg-honey/10 px-3 py-1.5 text-lg text-honey" />
        </div>
        {timerActive && (
          <div className="mx-auto max-w-xl px-4 pb-3">
            <TimerBar timer={view.live.timer} now={now} />
          </div>
        )}
        {reconnecting && <p className="bg-alarm px-4 py-1.5 text-center text-xs font-bold text-white">Connection lost. Reconnecting… your answers are safe.</p>}
      </header>

      {announcement && dismissed !== announcement.id && (
        <button type="button" onClick={() => setDismissed(announcement.id)} className="block w-full text-left">
          <TapeBand text="Announcement" fast className="text-[10px]" />
          <p className="bg-honey/10 px-4 py-3 text-center font-semibold text-honey">📣 {announcement.text}</p>
        </button>
      )}

      <main className="mx-auto max-w-xl px-4 pt-6">
        {tab === "mission" && <Mission view={view} act={act} openCase={() => setTab("case")} />}
        {tab === "case" && <CaseFile view={view} />}
        {tab === "board" && <Board view={view} act={act} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md" aria-label="Console">
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2 px-4 py-3">
          {(
            [
              ["mission", "🎯", "Mission"],
              ["case", "🗂️", "Case file"],
              ["board", "🧩", "Board"],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                if (id === "case") setUnseen(false);
                window.scrollTo({ top: 0 });
              }}
              aria-current={tab === id}
              className={`keycap relative flex-col gap-1 py-2 text-[11px] ${tab === id ? "keycap-honey" : ""}`}
            >
              <span className="text-lg leading-none">{icon}</span>
              {label}
              {id === "case" && unseen && <span className="absolute -top-1 -right-1 size-3 rounded-full bg-alarm shadow-[0_0_10px] shadow-alarm" />}
            </button>
          ))}
        </div>
        <button type="button" onClick={onSignOut} className="mx-auto mb-1 block text-[10px] text-dim hover:text-muted">
          Not {team.name}? Switch crew
        </button>
      </nav>
    </div>
  );
}
