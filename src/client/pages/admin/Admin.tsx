import { lazy, Suspense, useCallback, useState, type FormEvent } from "react";
import type { Action } from "../../../shared/protocol";
import { Boot } from "../../App";
import { Logo } from "../../components/Logo";
import { TimerBar } from "../../components/Timer";
import { errorText, useToast } from "../../components/ui";
import { readTimer, useNow } from "../../lib/clock";
import { linkTo, usePath } from "../../lib/router";
import { useGame } from "../../lib/socket";
import { StaffContext, useStaff, type StaffSession } from "./context";

const Control = lazy(() => import("./Control"));
const Teams = lazy(() => import("./Teams"));
const Rounds = lazy(() => import("./Rounds"));
const Scores = lazy(() => import("./Scores"));
const Content = lazy(() => import("./Content"));
const Data = lazy(() => import("./Data"));
const Print = lazy(() => import("./Print"));

const CREDS_KEY = "cas:staff";
type Creds = { role: "admin" | "volunteer"; password: string };

function loadCreds(): Creds | null {
  try {
    const raw = sessionStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as Creds) : null;
  } catch {
    return null;
  }
}

function saveCreds(creds: Creds | null) {
  try {
    if (creds) sessionStorage.setItem(CREDS_KEY, JSON.stringify(creds));
    else sessionStorage.removeItem(CREDS_KEY);
  } catch {
    // Storage blocked: staff will sign in again after a refresh.
  }
}

const NAV = [
  { path: "/admin", label: "Control room", icon: "🎛️", admin: true },
  { path: "/admin/teams", label: "Teams & check-in", icon: "🪪", admin: false },
  { path: "/admin/rounds", label: "Rounds & answers", icon: "🧾", admin: false },
  { path: "/admin/scores", label: "Scores & fixes", icon: "⚖️", admin: false },
  { path: "/admin/content", label: "Case & content", icon: "🗂️", admin: true },
  { path: "/admin/data", label: "Settings & data", icon: "💾", admin: true },
  { path: "/admin/print", label: "Print kit", icon: "🖨️", admin: false },
];

export default function Admin() {
  const [creds, setCreds] = useState<Creds | null>(loadCreds);
  const game = useGame(creds ? { t: "hello", role: creds.role, password: creds.password } : null);
  const toast = useToast();
  const { act } = game;

  const safeAct = useCallback(
    async (action: Action) => {
      try {
        await act(action);
        return true;
      } catch (error) {
        toast(errorText(error), "bad");
        return false;
      }
    },
    [act, toast],
  );

  if (!creds || game.status === "denied") {
    return (
      <Login
        error={game.status === "denied" ? game.error : null}
        onSubmit={(next) => {
          saveCreds(next);
          setCreds(next);
        }}
      />
    );
  }
  if (!game.view || game.view.kind !== "staff") return <Boot text="Opening the control room…" />;

  const session: StaffSession = { view: game.view, act: safeAct, password: creds.password, offset: game.offset, isAdmin: game.view.role === "admin" };
  return (
    <StaffContext.Provider value={session}>
      <Shell
        reconnecting={game.status === "reconnecting"}
        onSignOut={() => {
          saveCreds(null);
          setCreds(null);
        }}
      />
    </StaffContext.Provider>
  );
}

function Login({ error, onSubmit }: { error: string | null; onSubmit: (creds: Creds) => void }) {
  const [role, setRole] = useState<Creds["role"]>("admin");
  const [password, setPassword] = useState("");
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password) onSubmit({ role, password });
  }
  return (
    <main className="grain grid min-h-dvh place-items-center bg-hex px-5">
      <form onSubmit={handleSubmit} className="panel w-full max-w-md p-7">
        <Logo size="sm" />
        <h1 className="mt-6 font-display text-3xl font-black">Control room</h1>
        <p className="mt-1 text-muted">Organisers only. Every action here is logged.</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {(
            [
              ["admin", "🎛️ Club head", "Full control"],
              ["volunteer", "🪪 Desk volunteer", "Check-in & paper slips"],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              aria-pressed={role === value}
              onClick={() => setRole(value)}
              className={`rounded-xl border-2 p-3 text-left transition ${role === value ? "border-honey bg-honey/10" : "border-line bg-panel-2"}`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
        <label className="mt-5 block">
          <span className="label">Password</span>
          <input type="password" className="field mt-2" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && <p className="mt-4 rounded-xl border border-alarm/40 bg-alarm/10 px-4 py-3 text-sm text-alarm">{error}</p>}
        <button type="submit" className="keycap keycap-honey mt-6 w-full" disabled={!password}>
          Enter
        </button>
      </form>
    </main>
  );
}

function Shell({ reconnecting, onSignOut }: { reconnecting: boolean; onSignOut: () => void }) {
  const path = usePath();
  const { view, isAdmin } = useStaff();
  const nav = NAV.filter((n) => isAdmin || !n.admin);
  const fallback = isAdmin ? "/admin" : "/admin/teams";
  const current = nav.find((n) => n.path === path)?.path ?? fallback;

  if (current === "/admin/print") {
    return (
      <Suspense fallback={<Boot />}>
        <Print />
      </Suspense>
    );
  }

  const page = {
    "/admin": <Control />,
    "/admin/teams": <Teams />,
    "/admin/rounds": <Rounds />,
    "/admin/scores": <Scores />,
    "/admin/content": <Content />,
    "/admin/data": <Data />,
  }[current];

  return (
    <div className="min-h-dvh bg-ink lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-line bg-ink-2 lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block">
          <a href="/" onClick={linkTo("/")}>
            <Logo size="sm" />
          </a>
          <p className="label lg:mt-3">{view.role === "admin" ? "Club head" : "Desk volunteer"}</p>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3" aria-label="Admin">
          {nav.map((item) => (
            <a
              key={item.path}
              href={item.path}
              onClick={linkTo(item.path)}
              aria-current={current === item.path ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                current === item.path ? "bg-honey text-ink" : "text-muted hover:bg-panel hover:text-paper"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="hidden px-5 py-4 lg:absolute lg:bottom-0 lg:block">
          <a href="/screen" target="_blank" rel="noopener noreferrer" className="block text-sm text-muted hover:text-paper">
            Open projector screen ↗
          </a>
          <button type="button" onClick={onSignOut} className="mt-2 text-sm text-dim hover:text-alarm">
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <LiveBar reconnecting={reconnecting} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Suspense fallback={<p className="label">Loading…</p>}>{page}</Suspense>
        </main>
      </div>
    </div>
  );
}

const STAGE_NAMES: Record<string, string> = {
  lobby: "Lobby / check-in",
  briefing: "Briefing",
  round: "Round",
  leaderboard: "Leaderboard",
  break: "Break",
  consolidation: "Consolidation",
  finalReveal: "Final reveal",
  podium: "Podium",
};

/** Always-visible strip: what the room sees right now, and the clock. */
function LiveBar({ reconnecting }: { reconnecting: boolean }) {
  const { view, act, offset, isAdmin } = useStaff();
  const now = useNow(offset, 250);
  const { live } = view;
  const reading = readTimer(live.timer, now);
  const round = live.roundId ? view.rounds[live.roundId] : null;
  const teamsOnline = Object.values(view.staff.presence.teams).filter((n) => n > 0).length;

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur-md">
      {reconnecting && <p className="bg-alarm px-4 py-1 text-center text-xs font-bold text-white">Connection lost. Reconnecting…</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-alarm blink" />
          <span className="font-semibold">{STAGE_NAMES[live.stage]}</span>
          {live.stage === "round" && round && live.roundId && (
            <span className="chip text-xs">
              {round.codename} · {view.status[live.roundId]}
            </span>
          )}
          {live.leaderboardHidden && <span className="chip border-alarm/40 text-xs text-alarm">Leaderboard hidden</span>}
        </div>
        {!reading.idle && (
          <div className="flex items-center gap-2">
            <TimerBar timer={live.timer} now={now} compact />
            {isAdmin && (
              <div className="flex gap-1">
                {reading.paused ? (
                  <button type="button" className="keycap text-xs" onClick={() => act({ type: "timer.resume" })}>
                    ▶
                  </button>
                ) : (
                  <button type="button" className="keycap text-xs" onClick={() => act({ type: "timer.pause" })} disabled={!reading.running}>
                    ❚❚
                  </button>
                )}
                <button type="button" className="keycap text-xs" onClick={() => act({ type: "timer.add", seconds: -30 })}>
                  −30s
                </button>
                <button type="button" className="keycap text-xs" onClick={() => act({ type: "timer.add", seconds: 30 })}>
                  +30s
                </button>
                <button type="button" className="keycap keycap-honey text-xs" onClick={() => act({ type: "timer.add", seconds: 60 })}>
                  +1m
                </button>
              </div>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-4 font-mono text-xs text-muted">
          <span title="Teams with at least one phone connected">📱 {teamsOnline}/{view.staff.teams.length}</span>
          <span title="Projector screens connected">🖥️ {view.staff.presence.screens}</span>
          <span title="Staff connected">🧑‍💼 {view.staff.presence.staff}</span>
        </div>
      </div>
    </div>
  );
}
