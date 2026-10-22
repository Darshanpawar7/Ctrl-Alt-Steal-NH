import { useEffect, useState } from "react";
import type { TeamView } from "../../../shared/protocol";
import type { Mark } from "../../../shared/types";
import { ClueCard } from "../../components/Clue";
import { SectionLabel, errorText, useToast } from "../../components/ui";
import { buzz } from "../../lib/format";
import type { Act } from "../../lib/socket";

export function CaseFile({ view }: { view: TeamView }) {
  const c = view.caseFile;
  const clues = [c.clues.r1, c.clues.r2, c.clues.r3].filter(Boolean);
  const hints = Object.values(view.me.hints).flat();
  return (
    <div className="space-y-8 pb-6">
      <section>
        <p className="label text-alarm">Case #NH-404 · {c.modelName}</p>
        <h2 className="mt-2 font-display text-2xl font-black leading-tight">{c.headline}</h2>
        <div className="mt-4 space-y-3 text-paper/85">
          {c.story.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Timeline</SectionLabel>
        <ol className="mt-3 overflow-hidden rounded-2xl border border-line bg-ink-2 font-mono text-sm">
          {c.facts.map((f) => (
            <li key={f.time + f.text} className="grid grid-cols-[4.8rem_1fr] gap-2 border-b border-line px-4 py-2.5 last:border-0">
              <span className="text-honey">{f.time}</span>
              <span className="text-paper/85">{f.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionLabel>Evidence collected</SectionLabel>
        <div className="mt-3 space-y-3">
          {clues.length === 0 && !view.me.bonusClue && <p className="rounded-2xl border border-dashed border-line-2 p-5 text-center text-sm text-muted">No clues yet. Each round unlocks one.</p>}
          {clues.map((clue) => (
            <ClueCard key={clue!.title} clue={clue!} />
          ))}
          {view.me.bonusClue && <ClueCard clue={view.me.bonusClue} tone="ice" />}
          {hints.map((h) => (
            <p key={h.index + h.text} className="rounded-xl border border-ice/30 bg-ice/5 p-3 font-mono text-xs text-ice">
              HINT · {h.text}
            </p>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Suspects</SectionLabel>
        <div className="mt-3 space-y-3">
          {c.suspects.map((s) => (
            <article key={s.id} className="panel p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-14 place-items-center rounded-xl bg-panel-3 text-3xl">{s.emoji}</span>
                <div>
                  <p className="font-display font-bold">{s.name}</p>
                  <p className="text-sm text-honey">“{s.alias}” · <span className="text-muted">{s.role}</span></p>
                </div>
              </div>
              <p className="mt-3 text-sm text-paper/80">{s.bio}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {s.traits.map((t) => (
                  <li key={t} className="chip text-xs">
                    {t}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6">
        <div>
          <SectionLabel>Possible hideouts</SectionLabel>
          <ul className="mt-3 space-y-2">
            {c.locations.map((l) => (
              <li key={l.id} className="flex gap-3 rounded-xl border border-line bg-panel p-3 text-sm">
                <span className="text-xl">{l.emoji}</span>
                <span>
                  <b>{l.name}</b>
                  <span className="block text-muted">{l.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionLabel>Recovery methods</SectionLabel>
          <ul className="mt-3 space-y-2">
            {c.methods.map((m) => (
              <li key={m.id} className="flex gap-3 rounded-xl border border-line bg-panel p-3 text-sm">
                <span className="text-xl">{m.emoji}</span>
                <span>
                  <b>{m.name}</b>
                  <span className="block text-muted">{m.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

const NEXT_MARK: Record<Mark, Mark> = { none: "maybe", maybe: "cleared", cleared: "prime", prime: "none" };
const MARK_STYLE: Record<Mark, { badge: string; row: string; label: string }> = {
  none: { badge: "border-line-2 text-dim", row: "border-line bg-panel", label: "·" },
  maybe: { badge: "border-ice text-ice", row: "border-ice/40 bg-ice/5", label: "?" },
  cleared: { badge: "border-dim text-dim", row: "border-line bg-panel opacity-45 line-through", label: "✗" },
  prime: { badge: "border-honey bg-honey text-ink", row: "border-honey bg-honey/10 shadow-[0_0_20px] shadow-honey/20", label: "★" },
};

/** The crew's shared deduction grid. Marks sync across every phone on the team. */
export function Board({ view, act }: { view: TeamView; act: Act }) {
  const toast = useToast();
  const { marks } = view.me.board;
  const [notes, setNotes] = useState(view.me.board.notes);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setNotes(view.me.board.notes);
  }, [view.me.board.notes, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const id = window.setTimeout(() => {
      act({ type: "board.notes", notes })
        .then(() => setDirty(false))
        .catch((error: unknown) => toast(errorText(error), "bad"));
    }, 800);
    return () => window.clearTimeout(id);
  }, [notes, dirty, act, toast]);

  const tap = (key: string) => {
    const next = NEXT_MARK[marks[key] ?? "none"];
    buzz(10);
    act({ type: "board.mark", key, mark: next }).catch((error: unknown) => toast(errorText(error), "bad"));
  };

  const groups = [
    { title: "Who", prefix: "s", items: view.caseFile.suspects.map((s) => ({ id: s.id, emoji: s.emoji, name: s.name, sub: s.alias })) },
    { title: "Where", prefix: "l", items: view.caseFile.locations.map((l) => ({ id: l.id, emoji: l.emoji, name: l.name, sub: "" })) },
    { title: "How", prefix: "m", items: view.caseFile.methods.map((m) => ({ id: m.id, emoji: m.emoji, name: m.name, sub: "" })) },
  ];

  return (
    <div className="space-y-7 pb-6">
      <div className="flex flex-wrap gap-2 text-xs">
        {(["maybe", "cleared", "prime"] as Mark[]).map((m) => (
          <span key={m} className="chip">
            <span className={`grid size-5 place-items-center rounded border font-bold ${MARK_STYLE[m].badge}`}>{MARK_STYLE[m].label}</span>
            {m === "maybe" ? "Suspicious" : m === "cleared" ? "Ruled out" : "Prime suspect"}
          </span>
        ))}
        <span className="w-full text-muted">Tap to cycle. Your whole crew sees the same board.</span>
      </div>
      {groups.map((group) => (
        <section key={group.title}>
          <SectionLabel>{group.title}</SectionLabel>
          <ul className="mt-3 space-y-2">
            {group.items.map((item) => {
              const key = `${group.prefix}:${item.id}`;
              const mark = marks[key] ?? "none";
              const style = MARK_STYLE[mark];
              return (
                <li key={key}>
                  <button type="button" onClick={() => tap(key)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${style.row}`}>
                    <span className="text-2xl">{item.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.name}</span>
                      {item.sub && <span className="block truncate text-xs text-muted">“{item.sub}”</span>}
                    </span>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 font-bold ${style.badge}`}>{style.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section>
        <SectionLabel>Crew notes</SectionLabel>
        <textarea
          className="field mt-3 min-h-40 font-mono text-sm"
          value={notes}
          maxLength={2000}
          placeholder="Theories, contradictions, things to check…"
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
        />
        <p className="mt-1 text-right font-mono text-xs text-muted">{dirty ? "Saving…" : "Synced"}</p>
      </section>
    </div>
  );
}
