// Password checks and a small in-memory brake on guessing.

import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison, so response timing leaks nothing about the secret. */
export function secretMatches(given: string, secret: string | undefined): boolean {
  if (!secret) return false;
  return timingSafeEqual(digest(given), digest(secret));
}

const WINDOW_MS = 5 * 60_000;

/** Counts failures per key (an IP address) inside a sliding window. */
export class Limiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly max: number, private readonly windowMs = WINDOW_MS) {}

  blocked(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.max;
  }

  record(key: string, now: number): void {
    this.hits.set(key, [...this.recent(key, now), now]);
  }

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }
}
