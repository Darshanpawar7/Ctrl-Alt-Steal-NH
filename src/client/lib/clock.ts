import { useEffect, useState } from "react";
import type { TimerState } from "../../shared/types";

/** Re-renders every `intervalMs` and returns the server-aligned time. */
export function useNow(offset: number, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), intervalMs);
    setNow(Date.now() + offset);
    return () => window.clearInterval(id);
  }, [offset, intervalMs]);
  return now;
}

export interface TimerReading {
  leftMs: number;
  progress: number;
  running: boolean;
  paused: boolean;
  done: boolean;
  idle: boolean;
}

export function readTimer(timer: TimerState, now: number): TimerReading {
  if (timer.pausedLeftMs !== null) {
    return { leftMs: timer.pausedLeftMs, progress: progressOf(timer, timer.pausedLeftMs), running: false, paused: true, done: false, idle: false };
  }
  if (timer.endsAt === null) return { leftMs: 0, progress: 0, running: false, paused: false, done: false, idle: true };
  const leftMs = Math.max(0, timer.endsAt - now);
  return { leftMs, progress: progressOf(timer, leftMs), running: leftMs > 0, paused: false, done: leftMs === 0, idle: false };
}

function progressOf(timer: TimerState, leftMs: number): number {
  return timer.durationMs > 0 ? Math.min(1, Math.max(0, leftMs / timer.durationMs)) : 0;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
