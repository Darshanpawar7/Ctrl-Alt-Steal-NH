import { describe, expect, test } from "vitest";
import { defaultCase, defaultRounds } from "../src/server/game/content";
import { checkCase } from "../src/server/game/sanitize";
import { isCorrectAnswer } from "../src/server/game/util";

// These tests prove the default mystery is solvable and self-consistent:
// every puzzle decodes to the answer the key expects.

function caesarBack(text: string, shift: number): string {
  return text.replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 - shift + 26) % 26) + 65));
}

const rounds = defaultRounds();
const caseFile = defaultCase();
const logLines = rounds.r2.log.split("\n");

describe("the training log puzzle", () => {
  test("the missing loss continues the halving sequence", () => {
    const losses = logLines.filter((l) => l.startsWith("epoch")).map((l) => l.split("|")[1]!.replace("loss", "").trim());
    expect(losses[3]).toBe("?.???");
    expect(Number(losses[2]) / 2).toBeCloseTo(0.32);
    expect(Number(losses[4]) * 2).toBeCloseTo(0.32);
    expect(isCorrectAnswer("0.32", rounds.r2.questions[0]!.answers)).toBe(true);
  });

  test("the first letters of the notes spell the hidden place", () => {
    const acrostic = logLines
      .filter((l) => l.startsWith("epoch"))
      .map((l) => l.split("note:")[1]!.trim()[0])
      .join("");
    expect(acrostic).toBe("LIBRARY");
    expect(isCorrectAnswer(acrostic, rounds.r2.questions[1]!.answers)).toBe(true);
  });

  test("the sealed line decodes to the passphrase with the crashed epoch as the shift", () => {
    const crashed = logLines.findIndex((l) => l.includes("crash")) - logLines.findIndex((l) => l.startsWith("epoch 01")) + 1;
    expect(crashed).toBe(4);
    const sealed = logLines.find((l) => l.includes("sealed:"))!.split("sealed:")[1]!.trim();
    expect(caesarBack(sealed, crashed)).toBe("SHELF SEVEN. PASSPHRASE BUZZKILL");
    expect(isCorrectAnswer("Buzz Kill", rounds.r2.questions[2]!.answers)).toBe(true);
  });
});

describe("the case file", () => {
  test("the solution points at real options", () => {
    expect(checkCase(caseFile)).toBeNull();
  });

  test("every piece of evidence belongs to a known suspect", () => {
    const ids = new Set(caseFile.suspects.map((s) => s.id));
    for (const item of rounds.r3.items) expect(ids.has(item.suspectId)).toBe(true);
  });

  test("the Lineup leaves exactly the two liars the third clue names", () => {
    const alibiFakes = rounds.r3.items.filter((i) => i.fake && i.kind === "chat").map((i) => i.suspectId).sort();
    expect(alibiFakes).toEqual(["overfit", "root"]);
    expect(alibiFakes).toContain(caseFile.solution.thiefId);
  });

  test("Round 1 leads include exactly four real ones", () => {
    expect(rounds.r1.leads.filter((l) => l.real)).toHaveLength(4);
  });

  test("the vault has exactly one prize per door", () => {
    const prizes = rounds.r4.prizes.reduce((total, p) => total + p.count, 0);
    expect(prizes).toBe(rounds.r4.doors.length);
  });
});
