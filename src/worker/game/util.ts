// Small helpers shared by the game engine. No I/O, no Worker APIs beyond
// Web Crypto, so everything here runs the same in tests and in production.

/** No I, L, O, 0 or 1: easy to read off a card and type on a phone. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const TEAM_CODE_LENGTH = 6;

export function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const value = buf[0]!;
    if (value < limit) return value % maxExclusive;
  }
}

function randomString(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function newId(): string {
  return randomString(ID_ALPHABET, 10);
}

export function newTeamCode(taken: ReadonlySet<string>): string {
  for (;;) {
    const code = randomString(CODE_ALPHABET, TEAM_CODE_LENGTH);
    if (!taken.has(code)) return code;
  }
}

/** "abc-12x" → "ABC12X". Players may type the dash, spaces or lower case. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Lower-case and strip everything but letters and digits. */
export function normalizeAnswer(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isCorrectAnswer(given: string | undefined, accepted: readonly string[]): boolean {
  if (!given) return false;
  const value = normalizeAnswer(given);
  if (!value) return false;
  return accepted.some((answer) => normalizeAnswer(answer) === value);
}

export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
