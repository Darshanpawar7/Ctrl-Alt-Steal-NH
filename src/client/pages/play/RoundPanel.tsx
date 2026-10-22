import { useEffect, useRef, useState } from "react";
import type { TeamView } from "../../../shared/protocol";
import type { FinaleSub, R1Sub, R2Sub, R3Sub, R4Sub, RoundId, SubData } from "../../../shared/types";
import { EMPTY_SUB, FinaleForm, R1Form, R2Form, R3Form, R4Form, isComplete, r1Limit, vaultCap } from "../../components/rounds/forms";
import { ConfirmButton, errorText, useToast } from "../../components/ui";
import type { Act } from "../../lib/socket";
import { buzz, timeOfDay } from "../../lib/format";

type SaveState = "idle" | "saving" | "saved" | "error" | "invalid";

const SAVE_DELAY_MS = 700;

function problem(roundId: RoundId, data: SubData[RoundId], view: TeamView): string | null {
  const budget = view.me.budget;
  if (roundId === "r1") {
    const used = Object.values((data as R1Sub).stakes).reduce((a, b) => a + b, 0);
    if (used > r1Limit(view.rounds.r1, budget)) return "Over the staking limit.";
  }
  if (roundId === "r4") {
    const d = data as R4Sub;
    if (d.choice === "vault" && d.wager > vaultCap(view.rounds.r4, budget)) return "Wager is over your cap.";
  }
  if (roundId === "finale" && (data as FinaleSub).bet > budget) return "You can't bet more than you have.";
  return null;
}

/**
 * Holds the team's draft for one round. Edits save on their own after a
 * short pause, and edits made on a teammate's phone flow in when this phone
 * has nothing unsaved.
 */
export function RoundPanel({ view, act, roundId }: { view: TeamView; act: Act; roundId: RoundId }) {
  const toast = useToast();
  const status = view.status[roundId];
  const serverSub = view.me.subs[roundId];
  const locked = Boolean(serverSub?.lockedAt) || status !== "open";
  const [draft, setDraft] = useState<SubData[RoundId]>(() => serverSub?.data ?? EMPTY_SUB[roundId]);
  const [saveState, setSaveState] = useState<SaveState>(serverSub ? "saved" : "idle");
  const version = useRef(0);
  const savedVersion = useRef(0);

  // A teammate saved from another phone: take their version if we have no pending edits.
  useEffect(() => {
    if (serverSub && version.current === savedVersion.current) setDraft(serverSub.data);
  }, [serverSub?.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (version.current === savedVersion.current || locked) return;
    if (problem(roundId, draft, view)) {
      setSaveState("invalid");
      return;
    }
    const v = version.current;
    const id = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await act({ type: "sub.save", roundId, data: draft });
        if (version.current === v) savedVersion.current = v;
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        toast(errorText(error), "bad");
      }
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  function change(next: SubData[RoundId]) {
    version.current += 1;
    setDraft(next);
  }

  async function lockIn() {
    const issue = problem(roundId, draft, view);
    if (issue) return toast(issue, "bad");
    try {
      await act({ type: "sub.save", roundId, data: draft, lock: true });
      savedVersion.current = version.current;
      buzz([30, 40, 30]);
      toast("Locked in. Nice.", "good");
    } catch (error) {
      toast(errorText(error), "bad");
    }
  }

  const common = { disabled: locked, budget: view.me.budget, caseFile: view.caseFile };
  const form = (() => {
    switch (roundId) {
      case "r1":
        return <R1Form {...common} round={view.rounds.r1} value={draft as R1Sub} onChange={change} />;
      case "r2":
        return <R2Form {...common} round={view.rounds.r2} value={draft as R2Sub} onChange={change} />;
      case "r3":
        return <R3Form {...common} round={view.rounds.r3} value={draft as R3Sub} onChange={change} />;
      case "r4":
        return <R4Form {...common} round={view.rounds.r4} value={draft as R4Sub} onChange={change} />;
      case "finale":
        return <FinaleForm {...common} round={view.rounds.finale} value={draft as FinaleSub} onChange={change} />;
    }
  })();

  const complete = isComplete(roundId, draft, view.rounds);
  return (
    <div className="space-y-5">
      {form}
      {status === "open" && (
        <div className="sticky bottom-20 z-20 rounded-2xl border border-line-2 bg-panel/95 p-3 shadow-2xl backdrop-blur">
          {serverSub?.lockedAt ? (
            <p className="text-center font-semibold text-acid">🔒 Locked in at {timeOfDay(serverSub.lockedAt)}. Sit tight.</p>
          ) : (
            <div className="flex items-center gap-3">
              <SaveBadge state={saveState} at={serverSub?.savedAt} />
              <ConfirmButton className="keycap keycap-honey ml-auto text-sm" confirmLabel="Sure? Tap to lock" onConfirm={lockIn}>
                {roundId === "r2" ? "⚡ Lock in" : "🔒 Lock in"}
              </ConfirmButton>
            </div>
          )}
          {!serverSub?.lockedAt && !complete && <p className="mt-2 text-xs text-muted">Not finished yet. Whatever is saved when the timer ends will count.</p>}
          {!serverSub?.lockedAt && roundId === "r2" && complete && <p className="mt-2 text-xs text-muted">Lock in early to race for the speed bonus.</p>}
        </div>
      )}
    </div>
  );
}

function SaveBadge({ state, at }: { state: SaveState; at?: number }) {
  const text = {
    idle: "Nothing saved yet",
    saving: "Saving…",
    saved: at ? `Saved ✓ ${timeOfDay(at)}` : "Saved ✓",
    error: "Not saved. Retrying on next change.",
    invalid: "Fix the limit to save",
  }[state];
  const tone = state === "saved" ? "text-acid" : state === "error" || state === "invalid" ? "text-alarm" : "text-muted";
  return <span className={`font-mono text-xs ${tone}`}>{text}</span>;
}
