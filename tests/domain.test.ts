import { describe, it, expect } from "vitest";
import raw from "../public/data/content.json";
import type { Content } from "../src/types";
import {
  initialState,
  makeAttempt,
  conceptStatus,
  readiness,
  generateQueue,
  createExam,
  submitExam,
  examScore,
  planDay,
  localDate,
} from "../src/domain";
import { parseRecord, mergeRecords } from "../src/importer";
const c = raw as Content;
const a = c.questions.find((q) => q.conceptId === "P1-01")!,
  b = c.questions.find((q) => q.conceptId === "P1-01" && q.id !== a.id)!;
function state() {
  const s = initialState(c.version);
  s.settings.planStartDate = "2026-09-01";
  s.learnEvents.push({
    id: "read",
    conceptId: a.conceptId,
    readAt: "2026-09-01T01:00:00.000Z",
  });
  return s;
}
describe("evidence and scheduler", () => {
  it("does not inflate mastery by same-day repeats", () => {
    const s = state();
    for (let i = 0; i < 10; i++)
      s.attempts.push(
        makeAttempt(
          a,
          "a",
          "repeat" + i,
          "practice",
          new Date("2026-09-01T03:00:00Z"),
        ),
      );
    expect(conceptStatus(s, c, a.conceptId).mastered).toBe(false);
    expect(conceptStatus(s, c, a.conceptId).attempts).toHaveLength(1);
  });
  it("requires two families and cross-day evidence", () => {
    const s = state();
    s.attempts = [
      makeAttempt(a, "a", "a", "practice", new Date("2026-09-01T02:00:00Z")),
      makeAttempt(b, "a", "b", "practice", new Date("2026-09-02T02:00:00Z")),
      makeAttempt(a, "a", "c", "practice", new Date("2026-09-03T02:00:00Z")),
    ];
    expect(conceptStatus(s, c, a.conceptId).mastered).toBe(true);
    expect(conceptStatus(s, c, a.conceptId).nextReview).toBe("2026-09-10");
  });
  it("wrong answers require two recovery dates and families", () => {
    const s = state();
    s.attempts = [
      makeAttempt(a, "b", "a", "practice", new Date("2026-09-01T02:00:00Z")),
      makeAttempt(b, "a", "b", "practice", new Date("2026-09-02T02:00:00Z")),
    ];
    expect(conceptStatus(s, c, a.conceptId).mistake).toBe("recovering");
    s.attempts.push(
      makeAttempt(a, "a", "c", "practice", new Date("2026-09-03T02:00:00Z")),
    );
    expect(conceptStatus(s, c, a.conceptId).mistake).toBe("resolved");
  });
  it("unmeasured readiness is zero", () =>
    expect(readiness(initialState(c.version), c).score).toBe(0));
  it("uses Taipei midnight", () => {
    expect(localDate(new Date("2026-09-01T16:01:00Z"))).toBe("2026-09-02");
    expect(planDay(state(), new Date("2026-09-01T16:01:00Z"))).toBe(2);
  });
  it("carries incomplete core and never uses quarantined questions", () => {
    const q = generateQueue(state(), c, new Date("2026-09-03T02:00:00Z"));
    expect(q.tasks.some((t) => t.conceptId === "P1-01")).toBe(true);
    expect(
      q.tasks.every(
        (t) =>
          !t.questionId ||
          c.questions.find((q) => q.id === t.questionId)?.status ===
            "source_checked",
      ),
    ).toBe(true);
  });
  it("day14 has two exams, day15 has one and no new lessons", () => {
    const s = state();
    const d14 = generateQueue(s, c, new Date("2026-09-14T02:00:00Z")),
      d15 = generateQueue(s, c, new Date("2026-09-15T02:00:00Z"));
    expect(d14.tasks.filter((t) => t.kind === "exam")).toHaveLength(2);
    expect(d15.tasks.filter((t) => t.kind === "exam")).toHaveLength(1);
    expect(d15.tasks.some((t) => t.kind === "lesson")).toBe(false);
  });
  it("day15 excludes ordinary due concepts that are not final-review targets", () => {
    const s=state();
    const queue=generateQueue(s,c,new Date('2026-09-15T02:00:00Z'));
    expect(queue.tasks.some(t=>t.kind==='question'&&t.conceptId==='P1-01')).toBe(false);
  });
  it("submits exam only once, counts omitted answers", () => {
    const s = state(),
      e = createExam(s, c, "test", new Date("2026-09-12T01:00:00Z"));
    expect(new Set(e.questions.map((q) => q.id)).size).toBe(40);
    expect(e.questions.filter((q) => q.conceptId.startsWith("P"))).toHaveLength(
      20,
    );
    s.exams.push(e);
    e.answers[e.questions[0].id] = "a";
    submitExam(s, e.id);
    submitExam(s, e.id);
    expect(s.attempts).toHaveLength(40);
    expect(examScore(e).unanswered).toBe(39);
  });
});
describe("record safety", () => {
  it("round-trips and recomputes answer validity", () => {
    const s = state();
    s.attempts.push({ ...makeAttempt(a, "b", "x", "practice"), correct: true });
    const imported = parseRecord(JSON.stringify(s), c);
    expect(imported.attempts[0].correct).toBe(false);
  });
  it("rejects broken and unknown-schema imports", () => {
    expect(() => parseRecord("oops", c)).toThrow();
    expect(() =>
      parseRecord(JSON.stringify({ ...state(), schemaVersion: "9" }), c),
    ).toThrow();
  });
  it("merge deduplicates and is idempotent", () => {
    const s = state();
    expect(mergeRecords(s, s).learnEvents).toHaveLength(1);
    expect(mergeRecords(mergeRecords(s, s), s).learnEvents).toHaveLength(1);
  });
  it("round-trip queues merge despite object key order", () => {
    const s = state();
    s.queues.push(generateQueue(s, c, new Date("2026-09-01T02:00:00Z")));
    s.queues[0].tasks[0].completedAt = "2026-09-01T02:00:00.000Z";
    expect(
      mergeRecords(s, parseRecord(JSON.stringify(s), c)).queues,
    ).toHaveLength(1);
  });
  it("conflicting same IDs stop merge", () => {
    const s = state(),
      other = structuredClone(s);
    other.learnEvents[0].conceptId = "P1-02";
    expect(() => mergeRecords(s, other)).toThrow();
  });
  it("rejects altered exam answers", () => {
    const s = state(),
      e = createExam(s, c, "test");
    s.exams.push(e);
    e.answers[e.questions[0].id] = "not-an-option";
    expect(() => parseRecord(JSON.stringify(s), c)).toThrow();
  });
});
