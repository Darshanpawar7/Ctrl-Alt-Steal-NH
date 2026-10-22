import { useEffect, useState } from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  /** Press the keys one after another, like typing the shortcut. */
  animate?: boolean;
}

const SIZES = {
  sm: "text-[11px]",
  md: "text-sm",
  lg: "text-xl md:text-2xl",
  xl: "text-[20px] sm:text-3xl md:text-5xl",
};

const KEYS = [
  { label: "Ctrl", tone: "" },
  { label: "Alt", tone: "" },
  { label: "Steal", tone: "keycap-alarm" },
];

export function Logo({ size = "md", animate = false }: LogoProps) {
  const [down, setDown] = useState(-1);

  useEffect(() => {
    if (!animate) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let step = 0;
    const id = window.setInterval(() => {
      // 0,1,2 press each key in turn; 3 holds all three; then release and pause.
      setDown(step < 3 ? step : step === 3 ? 3 : -1);
      step = (step + 1) % 9;
    }, 380);
    return () => window.clearInterval(id);
  }, [animate]);

  return (
    <span className={`inline-flex items-center gap-[0.45em] ${SIZES[size]}`} aria-label="Ctrl+Alt+Steal" role="img">
      {KEYS.map((key, index) => (
        <span key={key.label} className="inline-flex items-center gap-[0.45em]">
          {index > 0 && <span className="font-display font-bold text-dim" aria-hidden>+</span>}
          <span
            aria-hidden
            className={`keycap ${key.tone} ${down === index || down === 3 ? "is-down" : ""} ${index === 2 ? "min-w-[4.4em]" : "min-w-[3em]"}`}
          >
            {key.label}
          </span>
        </span>
      ))}
    </span>
  );
}
