import type { RoundId } from "../../shared/types";

const numberFormat = new Intl.NumberFormat("en-IN");

export function credits(value: number): string {
  return numberFormat.format(Math.round(value));
}

export function signed(value: number): string {
  if (value === 0) return "±0";
  return `${value > 0 ? "+" : "−"}${numberFormat.format(Math.abs(Math.round(value)))}`;
}

export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const ROUND_LABEL: Record<RoundId, string> = {
  r1: "Round 1",
  r2: "Round 2",
  r3: "Round 3",
  r4: "Round 4",
  finale: "Finale",
};

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function joinUrl(): string {
  return `${window.location.origin}/play`;
}

export function downloadFile(name: string, content: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}
