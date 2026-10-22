import { animate } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { credits } from "../lib/format";

// ---------------------------------------------------------------- credits

export function HexCoin({ className = "size-[1em]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`inline-block shrink-0 ${className}`} aria-hidden>
      <path d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7z" fill="var(--color-honey)" />
      <path d="M12 1.5 21.5 7v10L12 22.5z" fill="var(--color-honey-deep)" opacity=".55" />
      <path d="M12 6.5 16.8 9.25v5.5L12 17.5 7.2 14.75v-5.5z" fill="none" stroke="var(--color-ink)" strokeWidth="1.6" />
    </svg>
  );
}

/** Counts smoothly from the previous value to the new one. */
export function Ticker({ value, className = "" }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(last.current, value, {
      duration: Math.min(1.6, 0.4 + Math.abs(value - last.current) / 1500),
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (node.textContent = credits(v)),
    });
    last.current = value;
    return () => controls.stop();
  }, [value]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {credits(value)}
    </span>
  );
}

export function Credits({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.3em] font-mono font-bold ${className}`}>
      <HexCoin />
      <Ticker value={value} />
    </span>
  );
}

export function Delta({ value, className = "" }: { value: number; className?: string }) {
  const tone = value > 0 ? "text-acid" : value < 0 ? "text-alarm" : "text-muted";
  return <span className={`font-mono font-bold tabular-nums ${tone} ${className}`}>{value > 0 ? "+" : value < 0 ? "−" : "±"}{credits(Math.abs(value))}</span>;
}

export function RankShift({ rank, prev }: { rank: number; prev: number | null }) {
  if (prev === null || prev === rank) return <span className="font-mono text-xs text-dim">—</span>;
  const up = prev > rank;
  return (
    <span className={`font-mono text-xs font-bold ${up ? "text-acid" : "text-alarm"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(prev - rank)}
    </span>
  );
}

// ---------------------------------------------------------------- toasts

type ToastTone = "good" | "bad" | "info";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}
const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
          {items.map((t) => (
            <div
              key={t.id}
              className={`rise pointer-events-auto max-w-md rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur ${
                t.tone === "bad" ? "border-alarm/50 bg-alarm-deep/90" : t.tone === "good" ? "border-acid/40 bg-panel/95 text-acid" : "border-line-2 bg-panel/95"
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

// ---------------------------------------------------------------- buttons

interface ConfirmButtonProps {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
}

/** Two taps to fire: the first arms it, the second confirms. Good for anything hard to undo. */
export function ConfirmButton({ onConfirm, children, confirmLabel = "Tap again to confirm", className = "keycap", disabled }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 3500);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={`${className} ${armed ? "keycap-alarm" : ""}`}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setArmed(false);
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

// ---------------------------------------------------------------- modal

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel rise max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-[18px] sm:p-6 ${wide ? "max-w-4xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" className="keycap text-xs" onClick={onClose} aria-label="Close">
            Esc
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- misc

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`label flex items-center gap-2 ${className}`}>
      <span className="inline-block size-1.5 rounded-full bg-honey" />
      {children}
    </div>
  );
}

export function Stamp({ tone, children, className = "" }: { tone: "acid" | "alarm" | "honey" | "ice"; children: ReactNode; className?: string }) {
  const color = { acid: "text-acid", alarm: "text-alarm", honey: "text-honey", ice: "text-ice" }[tone];
  return <span className={`stamp ${color} ${className}`}>{children}</span>;
}

export function Dot({ on, className = "" }: { on: boolean; className?: string }) {
  return <span className={`inline-block size-2 rounded-full ${on ? "bg-acid shadow-[0_0_10px] shadow-acid" : "bg-dim"} ${className}`} />;
}

export function TapeBand({ text, className = "", fast = false }: { text: string; className?: string; fast?: boolean }) {
  const chunk = `${text} ★ `.repeat(8);
  return (
    <div className={`tape-band py-2 text-xs ${className}`} aria-hidden>
      <div className={`marquee ${fast ? "marquee-fast" : ""}`}>
        <span className="pr-0">{chunk}</span>
        <span>{chunk}</span>
      </div>
    </div>
  );
}
