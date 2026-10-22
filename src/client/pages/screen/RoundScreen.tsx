import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { PublicView } from "../../../shared/protocol";
import type { RoundId } from "../../../shared/types";
import { EvidenceCard } from "../../components/Evidence";
import { TimerRing } from "../../components/Timer";
import { HexCoin, Stamp } from "../../components/ui";
import { credits } from "../../lib/format";

interface Props {
  view: PublicView;
  roundId: RoundId;
  now: number;
}

export function RoundScreen({ view, roundId, now }: Props) {
  const status = view.status[roundId];
  const round = view.rounds[roundId];
  const clue = roundId === "r1" || roundId === "r2" || roundId === "r3" ? view.caseFile.clues[roundId] : undefined;
  const sideTimer = status === "open" && roundId !== "r4";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end gap-10">
        <div className="min-w-0 flex-1">
          <p className="label text-[18px] text-honey">
            {round.codename} · {status === "intro" ? "Briefing" : status === "open" ? "Live" : status === "locked" ? "Locked" : "Revealed"}
          </p>
          <h1 className="mt-2 font-display text-[78px] leading-[0.95] font-black">{round.title}</h1>
          <p className="mt-2 text-[30px] text-honey/90">“{round.tagline}”</p>
        </div>
        {status === "locked" && <Stamp tone="alarm" className="mb-4 text-[44px]">Locked</Stamp>}
        {status === "revealed" && clue && <Stamp tone="acid" className="mb-4 text-[44px]">Clue unlocked</Stamp>}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 gap-8">
        <div className="min-h-0 min-w-0 flex-1">
          {status === "intro" ? <HowTo view={view} roundId={roundId} /> : <Body view={view} roundId={roundId} now={now} />}
        </div>
        {sideTimer && (
          <aside className="flex w-[380px] shrink-0 flex-col items-center gap-6">
            <TimerRing timer={view.live.timer} now={now} size={360} />
            <Progress view={view} roundId={roundId} />
          </aside>
        )}
      </div>

      {status === "revealed" && clue && (
        <div className="rise mt-6 rounded-2xl border border-honey/50 bg-gradient-to-r from-honey/15 to-panel px-8 py-5">
          <p className="font-display text-[24px] font-bold text-honey">{clue.title}</p>
          <p className="mt-1 text-[22px] leading-snug">{clue.text}</p>
        </div>
      )}
    </div>
  );
}

function HowTo({ view, roundId }: { view: PublicView; roundId: RoundId }) {
  const round = view.rounds[roundId];
  return (
    <div className="grid h-full grid-cols-2 gap-6">
      <ol className="space-y-4">
        {round.howTo.map((line, i) => (
          <li key={line} className="rise flex gap-5 rounded-2xl border border-line bg-panel p-6 text-[28px] leading-snug" style={{ animationDelay: `${i * 120}ms` }}>
            <span className="font-mono text-honey">0{i + 1}</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
      <div className="grid place-items-center rounded-3xl border border-dashed border-line-2">
        <div className="text-center">
          <p className="font-display text-[160px] leading-none font-black text-outline">{Math.round(round.durationSec / 60)}</p>
          <p className="label mt-2 text-[22px]">minutes on the clock</p>
          <p className="mt-6 text-[26px] text-muted">
            Open your phone · <span className="text-honey">Mission</span> tab
          </p>
        </div>
      </div>
    </div>
  );
}

function Progress({ view, roundId }: { view: PublicView; roundId: RoundId }) {
  const crews = view.teams.filter((t) => t.checkedIn && !t.disqualified);
  const submitted = new Set(view.stats.submitted[roundId]);
  const locked = new Set(view.stats.lockedIn[roundId]);
  const done = crews.filter((t) => submitted.has(t.id)).length;
  return (
    <div className="w-full rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-baseline justify-between">
        <span className="label text-[14px]">Answers in</span>
        <span className="font-display text-[34px] font-black">
          {done}
          <span className="text-dim">/{crews.length}</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {crews.map((t) => (
          <span key={t.id} title={t.name} className={`grid size-9 place-items-center rounded-lg text-[20px] transition ${locked.has(t.id) ? "bg-honey shadow-[0_0_14px] shadow-honey/50" : submitted.has(t.id) ? "bg-panel-3" : "bg-ink-2 opacity-30"}`}>
            {t.emoji}
          </span>
        ))}
      </div>
      {locked.size > 0 && <p className="mt-3 text-[16px] text-honey">🔒 {locked.size} locked in</p>}
    </div>
  );
}

function Body({ view, roundId, now }: Props) {
  switch (roundId) {
    case "r1":
      return <TradingFloor view={view} />;
    case "r2":
      return <TrainingLog view={view} />;
    case "r3":
      return <Lineup view={view} />;
    case "r4":
      return <Vault view={view} now={now} />;
    case "finale":
      return <Accusation view={view} />;
  }
}

// ---------------------------------------------------------------- R1

function TradingFloor({ view }: { view: PublicView }) {
  const leads = view.rounds.r1.leads ?? [];
  const market = view.stats.market;
  const top = market ? Math.max(1, ...Object.values(market).map((m) => m.total)) : 1;
  return (
    <ul className="grid h-full grid-cols-2 grid-rows-4 gap-4">
      {leads.map((lead, i) => {
        const m = market?.[lead.id];
        const verdict = lead.real;
        return (
          <li
            key={lead.id}
            className={`relative flex flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-700 ${
              verdict === true ? "border-acid bg-acid/10" : verdict === false ? "border-alarm/40 bg-panel opacity-60" : "border-line bg-panel"
            }`}
          >
            <div className="flex items-start gap-4">
              <span className="font-mono text-[18px] text-dim">L{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="label text-[13px] text-ice">{lead.source}</p>
                <p className="mt-1 text-[22px] leading-snug">{lead.text}</p>
              </div>
              <span className="shrink-0 rounded-xl border border-honey/50 bg-honey/10 px-3 py-1 font-mono text-[26px] font-bold text-honey">×{lead.odds}</span>
            </div>
            {m && (
              <div className="mt-auto flex items-center gap-3 pt-3">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-honey transition-all duration-1000" style={{ width: `${(m.total / top) * 100}%` }} />
                </div>
                <span className="font-mono text-[16px] text-muted">
                  {credits(m.total)} · {m.teams} crew{m.teams === 1 ? "" : "s"}
                </span>
              </div>
            )}
            {verdict !== undefined && (
              <span className="absolute top-3 right-28">
                <Stamp tone={verdict ? "acid" : "alarm"} className="text-[22px]">
                  {verdict ? "Real" : "Rumour"}
                </Stamp>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- R2

function TrainingLog({ view }: { view: PublicView }) {
  const r2 = view.rounds.r2;
  const revealed = r2.questions?.some((q) => q.answers);
  const byId = new Map(view.teams.map((t) => [t.id, t]));
  return (
    <div className="grid h-full grid-cols-[1.35fr_1fr] gap-6">
      <div className="overflow-hidden rounded-2xl border border-acid/30 bg-ink-2">
        <div className="flex items-center gap-3 border-b border-line px-6 py-3">
          <span className="size-3 rounded-full bg-acid blink" />
          <span className="font-mono text-[16px] text-muted">queenbee_train.log</span>
        </div>
        <pre className="overflow-hidden p-6 font-mono text-[19px] leading-[1.65] whitespace-pre-wrap text-acid/90">{r2.log}</pre>
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        {(r2.questions ?? []).map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[22px] font-semibold">
                <span className="mr-3 font-mono text-honey">Q{i + 1}</span>
                {q.prompt}
              </p>
              <span className="font-mono text-[18px] text-muted">+{q.points}</span>
            </div>
            {q.answers && <p className="rise mt-2 font-mono text-[34px] font-bold text-acid">{q.answers[0]}</p>}
          </div>
        ))}
        {revealed && view.stats.speedWinners && view.stats.speedWinners.length > 0 ? (
          <div className="rounded-2xl border border-honey/50 bg-honey/10 p-5">
            <p className="label text-[14px] text-honey">⚡ Speed bonus</p>
            <ol className="mt-2 space-y-1">
              {view.stats.speedWinners.map((id, i) => (
                <li key={id} className="flex items-center gap-3 text-[24px]">
                  <span className="font-mono text-honey">#{i + 1}</span>
                  <span>{byId.get(id)?.emoji}</span>
                  <span className="flex-1 truncate font-semibold">{byId.get(id)?.name}</span>
                  <span className="font-mono text-acid">+{r2.speedBonus[i]}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line-2 p-5 text-[20px] text-muted">
            ⚡ First {r2.speedBonus.length} crews to lock in all-correct answers win {r2.speedBonus.map((b) => `+${b}`).join(" / ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- R3

function Lineup({ view }: { view: PublicView }) {
  const items = view.rounds.r3.items ?? [];
  const [index, setIndex] = useState(0);
  const suspects = new Map(view.caseFile.suspects.map((s) => [s.id, s]));
  const revealed = items.some((i) => i.fake !== undefined);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % Math.max(1, items.length)), revealed ? 14_000 : 11_000);
    return () => window.clearInterval(id);
  }, [items.length, revealed]);
  const item = items[index % Math.max(1, items.length)];
  if (!item) return null;
  const votes = view.stats.votes?.[item.id];
  const total = votes ? votes.real + votes.fake : 0;
  return (
    <div className="grid h-full grid-cols-[1fr_300px] gap-6">
      <AnimatePresence mode="wait">
        <motion.div key={item.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.45 }} className="min-h-0">
          <div className="h-full overflow-hidden">
            <EvidenceCard item={item} index={items.indexOf(item)} suspect={suspects.get(item.suspectId)} big />
            {votes && total > 0 && (
              <div className="mt-4 flex h-12 overflow-hidden rounded-xl font-mono text-[18px] font-bold">
                <div className="grid place-items-center bg-acid text-ink" style={{ width: `${(votes.real / total) * 100}%` }}>
                  {votes.real > 0 && `REAL ${votes.real}`}
                </div>
                <div className="grid place-items-center bg-alarm text-white" style={{ width: `${(votes.fake / total) * 100}%` }}>
                  {votes.fake > 0 && `FAKE ${votes.fake}`}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      <ol className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li
            key={it.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-[17px] transition ${
              it.id === item.id ? "border-honey bg-honey/10" : "border-line bg-panel"
            }`}
          >
            <span className="font-mono text-dim">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{it.title}</span>
            {it.fake !== undefined && <span className={`font-mono text-[14px] font-bold ${it.fake ? "text-alarm" : "text-acid"}`}>{it.fake ? "FAKE" : "REAL"}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- R4

function Vault({ view, now }: { view: PublicView; now: number }) {
  const r4 = view.rounds.r4;
  const status = view.status.r4;
  const picks = view.stats.vaultPicks;
  const byId = new Map(view.teams.map((t) => [t.id, t]));
  return (
    <div className="flex h-full gap-8">
      <div className="grid min-w-0 flex-1 grid-cols-6 gap-4">
        {r4.doors.map((door) => {
          const prizeIndex = r4.opened[door];
          const prize = prizeIndex !== undefined ? r4.prizes[prizeIndex] : undefined;
          const crews = picks?.find((p) => p.door === door)?.teams ?? [];
          const good = prize && prize.multiplier >= 1;
          return (
            <div key={door} className="flex min-h-0 flex-col gap-3">
              <div className="relative h-[330px] [perspective:1200px]">
                <div
                  className={`absolute inset-0 grid place-items-center rounded-2xl border-4 transition-all duration-700 ${
                    prize ? (good ? "border-acid bg-acid/15" : prize.multiplier === 0 ? "border-alarm bg-alarm/25" : "border-alarm/60 bg-alarm/10") : "border-line-2 bg-gradient-to-b from-panel-3 to-panel"
                  }`}
                >
                  {prize ? (
                    <div className="rise text-center">
                      <p className="text-[90px] leading-none">{prize.emoji}</p>
                      <p className={`mt-3 font-display text-[30px] font-black ${good ? "text-acid" : "text-alarm"}`}>{prize.label}</p>
                      <p className="font-mono text-[26px] font-bold">×{prize.multiplier}</p>
                      {prize.clue && <p className="mt-2 text-[16px] text-ice">+ bonus clue</p>}
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="mx-auto grid size-28 place-items-center rounded-full border-[6px] border-line-2 bg-ink-2">
                        <span className="font-display text-[54px] font-black">{door}</span>
                      </div>
                      <div className="mx-auto mt-6 h-3 w-24 rounded-full bg-line-2" />
                    </div>
                  )}
                </div>
              </div>
              <ul className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
                {crews.map((c) => (
                  <li key={c.teamId} className="flex items-center gap-2 rounded-lg bg-panel px-3 py-1.5 text-[16px]">
                    <span>{byId.get(c.teamId)?.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">{byId.get(c.teamId)?.name}</span>
                    <span className="font-mono text-honey">{credits(c.wager)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <aside className="flex w-[340px] shrink-0 flex-col gap-4">
        {status === "open" && (
          <>
            <TimerRing timer={view.live.timer} now={now} size={260} />
            <Progress view={view} roundId="r4" />
          </>
        )}
        <div className="rounded-2xl border border-line bg-panel p-5">
          <p className="label text-[14px]">Behind the doors</p>
          <ul className="mt-3 space-y-2 text-[20px]">
            {r4.prizes.map((p) => (
              <li key={p.label} className="flex items-center gap-3">
                <span className="text-[28px]">{p.emoji}</span>
                <span className="flex-1">
                  {p.count}× {p.label}
                </span>
                <span className="font-mono font-bold">×{p.multiplier}</span>
              </li>
            ))}
          </ul>
        </div>
        {view.stats.vaultBanked && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-acid/40 bg-acid/5 p-5">
            <p className="label text-[14px] text-acid">🏦 Banked it ({view.stats.vaultBanked.length})</p>
            <p className="mt-2 text-[17px] leading-relaxed text-paper/80">{view.stats.vaultBanked.map((id) => `${byId.get(id)?.emoji} ${byId.get(id)?.name}`).join("  ·  ")}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- finale

function Accusation({ view }: { view: PublicView }) {
  const c = view.caseFile;
  const groups = [
    { title: "Who stole it?", items: c.suspects.map((s) => ({ id: s.id, emoji: s.emoji, name: s.name, sub: `“${s.alias}”` })) },
    { title: "Where is it hidden?", items: c.locations.map((l) => ({ id: l.id, emoji: l.emoji, name: l.name, sub: "" })) },
    { title: "How do we get it back?", items: c.methods.map((m) => ({ id: m.id, emoji: m.emoji, name: m.name, sub: "" })) },
  ];
  const pot = view.stats.finalePicks?.potTotal;
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-5">
        {groups.map((g) => (
          <section key={g.title} className="flex min-h-0 flex-col rounded-2xl border border-line bg-panel p-5">
            <p className="font-display text-[24px] font-bold text-honey">{g.title}</p>
            <ul className="mt-3 space-y-2">
              {g.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-xl bg-panel-2 px-4 py-2.5">
                  <span className="text-[30px]">{item.emoji}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[20px] font-semibold">{item.name}</span>
                    {item.sub && <span className="block text-[15px] text-muted">{item.sub}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {pot !== undefined && (
        <p className="flex items-center justify-center gap-3 text-[30px]">
          <HexCoin className="size-9" /> <b className="font-mono text-honey">{credits(pot)}</b> credits on the line
        </p>
      )}
    </div>
  );
}
