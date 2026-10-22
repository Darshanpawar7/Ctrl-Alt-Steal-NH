// Hand-built illustrations for the landing page. All CSS and SVG, no images.

export function CaseBoard({ modelName }: { modelName: string }) {
  return (
    <div className="relative mx-auto aspect-[4/4.2] w-full max-w-[520px] select-none" aria-hidden>
      {/* red yarn connecting the evidence */}
      <svg className="absolute inset-0 z-20 size-full" viewBox="0 0 400 420" fill="none">
        <path d="M110 62 C 200 110, 250 90, 300 150" stroke="var(--color-alarm)" strokeWidth="2" opacity=".8" />
        <path d="M300 150 C 300 210, 320 250, 315 290" stroke="var(--color-alarm)" strokeWidth="2" opacity=".8" />
        <path d="M110 62 C 50 170, 60 260, 105 330" stroke="var(--color-alarm)" strokeWidth="2" opacity=".5" strokeDasharray="5 6" />
        <path d="M105 330 C 190 360, 250 330, 315 290" stroke="var(--color-alarm)" strokeWidth="2" opacity=".8" />
        {[[110, 62], [300, 150], [105, 330], [315, 290]].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="7" fill="var(--color-alarm)" />
            <circle cx={(x ?? 0) - 2} cy={(y ?? 0) - 2} r="2.5" fill="#fff" opacity=".7" />
          </g>
        ))}
      </svg>

      {/* polaroid: the empty server rack */}
      <div className="float absolute left-[6%] top-[3%] z-10 w-[40%] rotate-[-6deg] bg-paper p-2.5 pb-9 shadow-2xl [--r:-6deg]">
        <div className="relative aspect-square overflow-hidden bg-ink">
          <div className="absolute inset-[12%] flex flex-col gap-[6%] rounded border border-line-2 bg-panel-2 p-[6%]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`flex h-full items-center gap-1 rounded-sm px-1.5 ${i === 2 ? "border border-dashed border-alarm bg-alarm/10" : "bg-panel-3"}`}>
                {i === 2 ? (
                  <span className="blink mx-auto font-mono text-[9px] font-bold text-alarm">EMPTY</span>
                ) : (
                  <>
                    <span className="size-1 rounded-full bg-acid" />
                    <span className="size-1 rounded-full bg-acid/50" />
                    <span className="ml-auto h-0.5 w-1/3 rounded bg-line-2" />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-center font-mono text-[11px] font-bold text-ink">LAB 404 · 9:02 AM</p>
      </div>

      {/* sticky note: the ransom message */}
      <div className="float absolute right-[2%] top-[22%] z-10 w-[40%] rotate-[5deg] bg-honey p-4 text-ink shadow-2xl [--r:5deg] [animation-delay:-2s]">
        <p className="font-display text-[clamp(10px,2.4vw,14px)] font-bold leading-snug">Ctrl+Alt+Steal.</p>
        <p className="mt-1 text-[clamp(10px,2.2vw,13px)] leading-snug">Your model, my rules. 🐝</p>
        <div className="absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 rotate-2 bg-paper/50" />
      </div>

      {/* index card: suspects */}
      <div className="float absolute bottom-[3%] left-[6%] z-10 w-[40%] rotate-[3deg] rounded-sm bg-paper p-3 text-ink shadow-2xl [--r:3deg] [animation-delay:-4s]">
        <p className="font-mono text-[10px] font-bold tracking-widest text-alarm">SUSPECTS</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {["?", "?", "?", "?", "?", "?"].map((q, i) => (
            <span key={i} className="grid aspect-square place-items-center rounded-sm bg-ink font-display text-sm font-black text-honey">
              {q}
            </span>
          ))}
        </div>
      </div>

      {/* case stamp */}
      <div className="absolute bottom-[16%] right-[3%] z-10 w-[42%] rotate-[-4deg] rounded-md border border-line-2 bg-panel p-3 shadow-2xl">
        <p className="label">Missing</p>
        <p className="mt-1 font-display text-lg font-black tracking-tight text-paper sm:text-xl">{modelName || "QUEENBEE"}</p>
        <p className="font-mono text-[10px] text-muted">weights.pt · 14 GB</p>
        <span className="stamp mt-2 text-[10px] text-alarm">Stolen</span>
      </div>
    </div>
  );
}

export function TradingArt() {
  const bars = [30, 52, 41, 66, 48, 80, 62, 92, 74];
  return (
    <div className="flex h-24 items-end gap-1.5" aria-hidden>
      {bars.map((h, i) => (
        <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: i % 3 === 1 ? "var(--color-alarm)" : "var(--color-acid)", opacity: 0.35 + i * 0.07 }} />
      ))}
    </div>
  );
}

export function TerminalArt() {
  return (
    <pre className="overflow-hidden rounded-lg bg-ink-2 p-3 font-mono text-[11px] leading-relaxed text-acid/80" aria-hidden>
      {"epoch 03 | loss 0.640\nepoch 04 | loss "}
      <span className="bg-alarm/30 text-alarm">?.???</span>
      {"\n>> SYS sealed: "}
      <span className="text-ice">WLIPJ ██</span>
      <span className="blink">▌</span>
    </pre>
  );
}

export function LineupArt() {
  return (
    <div className="flex items-end justify-center gap-3" aria-hidden>
      {["real", "fake", "real"].map((kind, i) => (
        <div key={i} className={`relative grid h-24 w-16 place-items-end overflow-hidden rounded-t-full border ${kind === "fake" ? "border-alarm/60 bg-alarm/10" : "border-line-2 bg-panel-3"}`}>
          <div className="mx-auto mb-0 h-12 w-12 rounded-t-full bg-dim/50" />
          <div className="absolute top-4 left-1/2 size-8 -translate-x-1/2 rounded-full bg-dim/60" />
          {kind === "fake" && <span className="stamp absolute top-8 text-[9px] text-alarm">AI</span>}
        </div>
      ))}
    </div>
  );
}

export function VaultArt() {
  return (
    <div className="relative mx-auto size-28" aria-hidden>
      <div className="absolute inset-0 rounded-full border-[6px] border-line-2 bg-panel-3 shadow-[inset_0_0_30px_rgb(0_0_0/0.6)]" />
      <div className="absolute inset-4 animate-[spin_12s_linear_infinite] rounded-full border-2 border-dashed border-honey/60" />
      <div className="absolute inset-[38%] rounded-full bg-honey shadow-[0_0_30px] shadow-honey/50" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <span key={deg} className="absolute left-1/2 top-1/2 h-[46%] w-1 origin-top rounded bg-line-2" style={{ transform: `translateX(-50%) rotate(${deg}deg)` }} />
      ))}
    </div>
  );
}
