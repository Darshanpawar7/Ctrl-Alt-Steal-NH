import type { PublicEvidence } from "../../shared/protocol";
import type { Suspect } from "../../shared/types";
import { Stamp } from "./ui";

interface EvidenceCardProps {
  item: PublicEvidence;
  index: number;
  suspect?: Suspect;
  big?: boolean;
}

/** Renders one piece of Lineup evidence in the style of where it came from. */
export function EvidenceCard({ item, index, suspect, big = false }: EvidenceCardProps) {
  const revealed = item.fake !== undefined;
  const text = big ? "text-lg" : "text-sm";
  return (
    <article className={`relative overflow-hidden rounded-2xl border ${revealed ? (item.fake ? "border-alarm/60" : "border-acid/50") : "border-line"} bg-panel`}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid size-6 place-items-center rounded-md bg-panel-3 font-mono text-xs font-bold">{index + 1}</span>
        <span className={`truncate font-semibold ${big ? "text-lg" : "text-sm"}`}>{item.title}</span>
        {suspect && <span className="ml-auto shrink-0 text-xs text-muted">{suspect.emoji} {suspect.alias}</span>}
      </header>
      <div className="p-4">
        {item.imageSrc && <img src={item.imageSrc} alt={item.title} loading="lazy" className="mb-3 max-h-[360px] w-full rounded-xl object-contain bg-ink" />}
        <Body item={item} text={text} />
      </div>
      {revealed && (
        <footer className={`border-t px-4 py-3 ${item.fake ? "border-alarm/30 bg-alarm/10" : "border-acid/20 bg-acid/5"}`}>
          <p className={`${text} text-paper/90`}>{item.tell}</p>
        </footer>
      )}
      {revealed && (
        <div className="pointer-events-none absolute top-12 right-3">
          <Stamp tone={item.fake ? "alarm" : "acid"} className={big ? "text-2xl" : "text-base"}>
            {item.fake ? "AI fake" : "Real"}
          </Stamp>
        </div>
      )}
    </article>
  );
}

function Body({ item, text }: { item: PublicEvidence; text: string }) {
  switch (item.kind) {
    case "chat":
      return (
        <div>
          <p className="mb-2 font-mono text-[11px] text-dim">{item.meta}</p>
          <p className={`max-w-[92%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-[#1f3a2f] px-3.5 py-2.5 ${text} leading-relaxed text-[#e8f5ec]`}>{item.body}</p>
        </div>
      );
    case "post":
      return (
        <div>
          <p className="mb-2 font-mono text-[11px] text-violet">{item.meta}</p>
          <p className={`whitespace-pre-line rounded-xl bg-gradient-to-br from-violet/15 via-alarm/10 to-honey/10 p-3.5 ${text} leading-relaxed`}>{item.body}</p>
        </div>
      );
    case "email":
      return (
        <div className="rounded-xl bg-paper p-3.5 text-ink">
          <p className="border-b border-ink/10 pb-2 font-mono text-[11px] text-ink/60">{item.meta}</p>
          <p className={`mt-2 whitespace-pre-line ${text} leading-relaxed`}>{item.body}</p>
        </div>
      );
    case "log":
      return (
        <div>
          <p className="mb-2 font-mono text-[11px] text-dim">{item.meta}</p>
          <pre className={`overflow-x-auto whitespace-pre-wrap rounded-xl bg-ink-2 p-3.5 font-mono ${text === "text-lg" ? "text-base" : "text-xs"} leading-relaxed text-acid/90`}>{item.body}</pre>
        </div>
      );
    case "photo":
      return <p className={`${text} text-muted`}>{item.meta}{item.body ? ` · ${item.body}` : ""}</p>;
    default:
      return (
        <div className="rotate-[-0.4deg] rounded-md bg-[#efe6cf] p-3.5 text-[#2a2318] shadow-inner">
          <p className="mb-2 font-mono text-[11px] text-[#2a2318]/60">{item.meta}</p>
          <p className={`whitespace-pre-line font-mono ${text === "text-lg" ? "text-base" : "text-[13px]"} leading-relaxed`}>{item.body}</p>
        </div>
      );
  }
}
