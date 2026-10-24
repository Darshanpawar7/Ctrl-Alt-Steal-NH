import type { Action, StaffView } from "../../../shared/protocol";
import { REVEAL_STEPS, ROUND_IDS, type RoundId, type RoundStatus, type Stage } from "../../../shared/types";

/** The parts of the game the run of show reads. */
export type ShowView = Pick<StaffView, "status" | "live">;

export interface Step {
  id: string;
  at: string;
  title: string;
  detail: string;
  actions: Action[];
  /** True once the game has reached (or moved past) this step. */
  done: (v: ShowView) => boolean;
}

const after = (status: RoundStatus, ...ok: RoundStatus[]) => ok.includes(status);
const LATE_STAGES: Stage[] = ["consolidation", "finalReveal", "podium"];

function roundSteps(id: RoundId, at: [string, string, string, string], label: string): Step[] {
  return [
    { id: `${id}-intro`, at: at[0], title: `${label}: explain the round`, detail: "Shows the rules and content on the big screen. Answers stay closed.", actions: [{ type: "round.set", roundId: id, status: "intro" }], done: (v) => v.status[id] !== "pending" },
    { id: `${id}-open`, at: at[1], title: `${label}: GO`, detail: "Starts the countdown. Phones can answer until it hits zero.", actions: [{ type: "round.set", roundId: id, status: "open" }], done: (v) => after(v.status[id], "open", "locked", "revealed") },
    { id: `${id}-lock`, at: at[2], title: `${label}: lock answers`, detail: "Happens on its own at 00:00. Use this to lock early. Enter paper slips now.", actions: [{ type: "round.set", roundId: id, status: "locked" }], done: (v) => after(v.status[id], "locked", "revealed") },
    { id: `${id}-reveal`, at: at[3], title: `${label}: reveal`, detail: id === "r4" ? "Switches to the vault. Open the doors one by one below." : "Shows the answers, pays out credits and unlocks the clue.", actions: [{ type: "round.set", roundId: id, status: "revealed" }], done: (v) => v.status[id] === "revealed" },
  ];
}

function revealStep(step: number, at: string, title: string, detail: string): Step {
  return {
    id: `reveal-${step}`,
    at,
    title,
    detail,
    actions: [{ type: "live.revealStep", step }],
    done: (v) => v.live.stage === "podium" || (v.live.stage === "finalReveal" && v.live.revealStep >= step),
  };
}

export const STEPS: Step[] = [
  { id: "lobby", at: "0:00", title: "Open check-in", detail: "Lobby screen with the join QR. Check crews in on the Teams page.", actions: [{ type: "stage.set", stage: "lobby" }], done: () => true },
  { id: "briefing", at: "0:15", title: "Briefing & story", detail: "The story, the timeline and the six suspects.", actions: [{ type: "stage.set", stage: "briefing" }], done: (v) => v.live.stage !== "lobby" || v.status.r1 !== "pending" },
  ...roundSteps("r1", ["0:25", "0:30", "0:40", "0:43"], "Trading Floor"),
  { id: "lb1", at: "0:48", title: "Leaderboard", detail: "Show the standings after Round 1.", actions: [{ type: "stage.set", stage: "leaderboard" }], done: (v) => v.status.r2 !== "pending" || (v.status.r1 === "revealed" && v.live.stage === "leaderboard") },
  ...roundSteps("r2", ["0:50", "0:53", "1:08", "1:10"], "Training Log"),
  ...roundSteps("r3", ["1:15", "1:18", "1:30", "1:33"], "Lineup"),
  { id: "lb3", at: "1:38", title: "Leaderboard", detail: "Standings before the break.", actions: [{ type: "stage.set", stage: "leaderboard" }], done: (v) => v.live.stage === "break" || v.status.r4 !== "pending" || (v.status.r3 === "revealed" && v.live.stage === "leaderboard") },
  { id: "break", at: "1:40", title: "Break (10 min)", detail: "Break screen with a countdown and AI facts.", actions: [{ type: "stage.set", stage: "break" }, { type: "timer.start", seconds: 600, label: "Break" }], done: (v) => v.live.stage === "break" || v.status.r4 !== "pending" },
  ...roundSteps("r4", ["1:50", "1:53", "2:00", "2:02"], "Vault"),
  { id: "blackout", at: "2:09", title: "Leaderboard blackout", detail: "Hide the rankings from here to the reveal. Teams still see their own credits.", actions: [{ type: "live.leaderboard", hidden: true }, { type: "stage.set", stage: "leaderboard" }], done: (v) => v.live.leaderboardHidden || LATE_STAGES.includes(v.live.stage) || v.status.finale !== "pending" },
  { id: "consolidate", at: "2:10", title: "Connect the dots (15 min)", detail: "All clues on screen. Volunteers give no hints.", actions: [{ type: "stage.set", stage: "consolidation" }, { type: "timer.start", seconds: 900, label: "Clue consolidation" }], done: (v) => LATE_STAGES.includes(v.live.stage) || v.status.finale !== "pending" },
  { id: "finale-open", at: "2:25", title: "Name the Thief: GO", detail: "Final answers and bets. 8 minutes.", actions: [{ type: "round.set", roundId: "finale", status: "open" }], done: (v) => after(v.status.finale, "open", "locked", "revealed") },
  { id: "finale-lock", at: "2:33", title: "Lock final answers", detail: "Happens at 00:00. Enter any paper slips before the reveal.", actions: [{ type: "round.set", roundId: "finale", status: "locked" }], done: (v) => after(v.status.finale, "locked", "revealed") },
  { id: "reveal", at: "2:37", title: "The reveal begins", detail: "“The answers are in” + the total credits on the line.", actions: [{ type: "stage.set", stage: "finalReveal" }], done: (v) => v.live.stage === "finalReveal" || v.live.stage === "podium" },
  revealStep(1, "2:38", "Reveal: the thief", "Drumroll, then the thief and how many crews named them."),
  revealStep(2, "2:40", "Reveal: the hideout", "Where QUEENBEE was hidden."),
  revealStep(3, "2:42", "Reveal: the recovery", "How to get it back. Final bets pay out now."),
  revealStep(4, "2:44", "Epilogue", "Case closed."),
  revealStep(5, "2:45", "Final standings", "The leaderboard returns, with every final bet."),
  { id: "podium", at: "2:47", title: "Podium & badges", detail: "Top three, confetti, fanfare and the badge wall.", actions: [{ type: "stage.set", stage: "podium" }], done: (v) => v.live.stage === "podium" },
];

/** The step the ▶ Next button runs, or -1 once the event is over. */
export function nextStepIndex(view: ShowView): number {
  return STEPS.findIndex((step) => !step.done(view));
}

type Rewind = Extract<Action, { type: "show.rewind" }>;
type ShowState = Omit<Rewind, "type" | "label" | "status"> & { status: Record<RoundId, RoundStatus> };

/** Where the show stands once steps 0..index have run in order, mirroring what the server does for each action. */
function stateAfter(index: number): ShowState {
  const s: ShowState = {
    status: Object.fromEntries(ROUND_IDS.map((id) => [id, "pending"])) as Record<RoundId, RoundStatus>,
    stage: "lobby",
    roundId: null,
    leaderboardHidden: false,
    revealStep: 0,
  };
  for (const step of STEPS.slice(0, index + 1)) {
    for (const action of step.actions) {
      if (action.type === "round.set") {
        s.status[action.roundId] = action.status;
        if (action.roundId === "finale" && action.status !== "revealed") s.revealStep = 0;
        if (action.status !== "pending") {
          s.stage = "round";
          s.roundId = action.roundId;
        }
      } else if (action.type === "stage.set") {
        s.stage = action.stage;
        if (action.roundId !== undefined) s.roundId = action.roundId;
        if (action.stage === "finalReveal") {
          if (s.status.finale !== "revealed") {
            s.status.finale = "revealed";
            s.revealStep = 0;
          }
          s.roundId = "finale";
          s.leaderboardHidden = true;
        }
      } else if (action.type === "live.leaderboard") {
        s.leaderboardHidden = action.hidden;
      } else if (action.type === "live.revealStep") {
        s.revealStep = action.step;
        if (action.step >= REVEAL_STEPS.indexOf("standings")) s.leaderboardHidden = false;
      }
    }
  }
  return s;
}

const rewindTo = (index: number, label: string): Action => ({ type: "show.rewind", ...stateAfter(index), label });

/** "Go back here": rewinds to just before the step, then runs it again. Answers are kept. */
export function goToActions(index: number): Action[] {
  const step = STEPS[index]!;
  return [rewindTo(index - 1, step.title), ...step.actions];
}

/** ◀ Back: undoes the latest step without re-running anything. Null at check-in, where there is nothing to undo. */
export function backActions(view: ShowView): Action[] | null {
  const next = nextStepIndex(view);
  const latest = (next === -1 ? STEPS.length : next) - 1;
  if (latest <= 0) return null;
  return [rewindTo(latest - 1, STEPS[latest - 1]!.title)];
}
