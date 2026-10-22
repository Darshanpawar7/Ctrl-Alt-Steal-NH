import type { TimerState } from "../../shared/types";
import { formatClock, readTimer } from "../lib/clock";

interface TimerProps {
  timer: TimerState;
  now: number;
}

function tone(leftMs: number, done: boolean): string {
  if (done || leftMs <= 10_000) return "var(--color-alarm)";
  if (leftMs <= 60_000) return "var(--color-honey)";
  return "var(--color-acid)";
}

/** Huge ring timer for the projector. */
export function TimerRing({ timer, now, size = 420 }: TimerProps & { size?: number }) {
  const reading = readTimer(timer, now);
  if (reading.idle) return null;
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const color = tone(reading.leftMs, reading.done);
  const urgent = reading.running && reading.leftMs <= 10_000;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - reading.progress)}
          style={{ transition: "stroke-dashoffset 250ms linear, stroke 400ms", filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div className="text-center">
        <div className={`font-mono font-bold tabular-nums ${urgent ? "pulse-alarm" : ""}`} style={{ fontSize: size * 0.24, color, lineHeight: 1 }}>
          {reading.done ? "00:00" : formatClock(reading.leftMs)}
        </div>
        <div className="label mt-3" style={{ fontSize: size * 0.038 }}>
          {reading.done ? "Time's up" : reading.paused ? "Paused" : timer.label || "Time left"}
        </div>
      </div>
    </div>
  );
}

/** Compact bar timer for phones and the admin header. */
export function TimerBar({ timer, now, compact = false }: TimerProps & { compact?: boolean }) {
  const reading = readTimer(timer, now);
  if (reading.idle) return null;
  const color = tone(reading.leftMs, reading.done);
  return (
    <div className={compact ? "min-w-28" : "w-full"}>
      <div className="flex items-baseline justify-between gap-3">
        {!compact && <span className="label truncate">{reading.paused ? "Paused" : reading.done ? "Time's up" : timer.label || "Time left"}</span>}
        <span className={`font-mono text-lg font-bold tabular-nums ${reading.running && reading.leftMs <= 10_000 ? "pulse-alarm" : ""}`} style={{ color }}>
          {reading.done ? "00:00" : formatClock(reading.leftMs)}
          {reading.paused && <span className="ml-1 text-xs text-muted">❚❚</span>}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${reading.progress * 100}%`, background: color, transition: "width 250ms linear" }} />
      </div>
    </div>
  );
}
