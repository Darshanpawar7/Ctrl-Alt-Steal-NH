// Small form building blocks for the content editors.

import type { ReactNode } from "react";

export function Text({ label, value, onChange, area = false, mono = false, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; mono?: boolean; rows?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {area ? (
        <textarea className={`field mt-1 ${mono ? "font-mono text-xs" : "text-sm"}`} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={`field mt-1 ${mono ? "font-mono" : ""} text-sm`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

export function Num({ label, value, onChange, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="number" step={step} className="field mt-1 font-mono text-sm" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="size-5 accent-honey" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field mt-1 text-sm" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One string per line in a textarea. */
export function Lines({ label, value, onChange, rows = 4 }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return <Text label={`${label} (one per line)`} area rows={rows} value={value.join("\n")} onChange={(v) => onChange(v.split("\n"))} />;
}

interface ListProps<T> {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  max?: number;
}

export function ListEditor<T>({ title, items, onChange, make, render, max = 20 }: ListProps<T>) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="label">
          {title} ({items.length})
        </span>
        {items.length < max && (
          <button type="button" className="keycap text-xs" onClick={() => onChange([...items, make()])}>
            + Add
          </button>
        )}
      </div>
      {items.map((item, index) => (
        <div key={index} className="rounded-2xl border border-line bg-panel-2 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-xs text-honey">#{index + 1}</span>
            <span className="ml-auto flex gap-1">
              <button type="button" className="keycap px-2 py-1 text-[10px]" onClick={() => move(index, index - 1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="keycap px-2 py-1 text-[10px]" onClick={() => move(index, index + 1)} aria-label="Move down">
                ↓
              </button>
              <button type="button" className="keycap px-2 py-1 text-[10px]" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label="Remove">
                ✕
              </button>
            </span>
          </div>
          <div className="grid gap-3">{render(item, (patch) => onChange(items.map((x, i) => (i === index ? { ...x, ...patch } : x))), index)}</div>
        </div>
      ))}
    </section>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const cls = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" }[cols];
  return <div className={`grid gap-3 ${cls}`}>{children}</div>;
}
