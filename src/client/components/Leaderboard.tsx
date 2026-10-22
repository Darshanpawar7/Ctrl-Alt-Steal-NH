import { LayoutGroup, motion } from "motion/react";
import type { PublicTeam } from "../../shared/protocol";
import type { Standing } from "../../shared/types";
import { HexCoin, RankShift, Ticker } from "./ui";

interface LeaderboardProps {
  standings: Standing[];
  teams: PublicTeam[];
  highlight?: string | null;
  limit?: number;
  big?: boolean;
}

const MEDAL = ["var(--color-honey)", "#d9dce6", "#e0915a"];

export function Leaderboard({ standings, teams, highlight = null, limit, big = false }: LeaderboardProps) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rows = limit ? standings.slice(0, limit) : standings;
  const top = Math.max(1, ...standings.map((s) => s.credits));

  if (!rows.length) {
    return <p className="py-8 text-center text-muted">No crews on the board yet.</p>;
  }

  return (
    <LayoutGroup>
      <ol className={`flex flex-col ${big ? "gap-2.5" : "gap-1.5"}`}>
        {rows.map((s) => {
          const team = byId.get(s.teamId);
          const medal = s.rank <= 3 ? MEDAL[s.rank - 1] : undefined;
          return (
            <motion.li
              layout
              key={s.teamId}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 ${big ? "py-3" : "py-2"} ${
                s.teamId === highlight ? "border-honey bg-honey/10" : "border-line bg-panel"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 opacity-[0.07]"
                style={{ width: `${(s.credits / top) * 100}%`, background: medal ?? "var(--color-paper)", transition: "width 900ms var(--ease-out-expo)" }}
              />
              <span
                className={`relative grid shrink-0 place-items-center rounded-lg font-display font-black ${big ? "size-12 text-xl" : "size-8 text-sm"}`}
                style={{ background: medal ?? "var(--color-panel-3)", color: medal ? "var(--color-ink)" : "var(--color-paper)" }}
              >
                {s.rank}
              </span>
              <span className={`relative ${big ? "text-3xl" : "text-xl"}`}>{team?.emoji ?? "🐝"}</span>
              <span className={`relative min-w-0 flex-1 truncate font-semibold ${big ? "text-2xl" : ""}`}>{team?.name ?? "Unknown crew"}</span>
              <span className="relative w-10 text-right">
                <RankShift rank={s.rank} prev={s.prevRank} />
              </span>
              <span className={`relative flex items-center gap-1.5 font-mono font-bold text-honey ${big ? "text-2xl" : ""}`}>
                <HexCoin />
                <Ticker value={s.credits} />
              </span>
            </motion.li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}
