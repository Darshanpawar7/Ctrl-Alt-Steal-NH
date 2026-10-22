// Password checks and a small in-memory brake on guessing.

const encoder = new TextEncoder();

/** Constant-time comparison, so response timing leaks nothing about the secret. */
export async function secretMatches(given: string, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
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
