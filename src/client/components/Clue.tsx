import type { Clue } from "../../shared/types";

export function ClueCard({ clue, tone = "honey", big = false }: { clue: Clue; tone?: "honey" | "ice"; big?: boolean }) {
  const accent = tone === "honey" ? "border-honey/50 from-honey/15" : "border-ice/50 from-ice/15";
  return (
    <article className={`rise relative overflow-hidden rounded-2xl border bg-gradient-to-br via-panel to-panel ${accent} ${big ? "p-8" : "p-5"}`}>
      <div className="absolute top-0 right-0 h-full w-2 tape opacity-60" aria-hidden />
      <p className={`label ${tone === "honey" ? "text-honey" : "text-ice"}`}>{tone === "honey" ? "Clue unlocked" : "Classified · your crew only"}</p>
      <h3 className={`mt-2 font-display font-bold ${big ? "text-3xl" : "text-lg"}`}>{clue.title}</h3>
      <p className={`mt-3 leading-relaxed text-paper/90 ${big ? "text-2xl" : ""}`}>{clue.text}</p>
    </article>
  );
}
