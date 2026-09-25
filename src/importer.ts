import { z } from "zod";
import type { Content, StudyState } from "./types";
const id = z.string().min(1).max(160),
  date = z.iso.datetime(),
  day = z.iso.date();
const error = z.enum([
  "概念不懂",
  "數字記錯",
  "選項混淆",
  "看錯題目",
  "計算失誤",
  "不確定／猜測",
  "未分類",
]);
const question = z
  .object({
    id,
    version: id,
    familyId: id,
    conceptId: id,
    stem: z.string().max(4000),
    options: z
      .array(z.object({ id, text: z.string().max(2000) }).strict())
      .length(4),
    correctOptionId: id,
    explanation: z.string().max(8000),
    optionReasons: z.record(z.string(), z.string()),
    numeric: z.boolean(),
    status: z.enum(["source_checked", "quarantined"]),
    sourcePages: z.array(z.number().int().min(1).max(1140)),
    origin: z.literal("lecture_adapted"),
    scope: z.literal("lecture_115_07"),
  })
  .strict();
export const recordSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    kind: z.literal("record_export"),
    contentVersion: id,
    revision: z.number().int().nonnegative(),
    exportedAt: date.optional(),
    settings: z
      .object({
        profileId: id,
        planStartDate: day,
        examDate: day.nullable(),
        dailyMinutes: z.number().int().min(180).max(600),
        timezone: z.literal("Asia/Taipei"),
        setupComplete: z.boolean(),
        examName: z.string().min(1).max(100),
        examMinutes: z.number().int().min(10).max(180),
        examQuestions: z.number().int().min(10).max(100),
        updatedAt: date,
      })
      .strict(),
    attempts: z
      .array(
        z
          .object({
            id,
            questionId: id,
            questionVersion: id,
            familyId: id,
            conceptId: id,
            selectedOptionId: id.nullable(),
            correct: z.boolean(),
            answeredAt: date,
            localDate: day,
            durationMs: z.number().nonnegative(),
            mode: z.enum(["practice", "number", "task", "exam"]),
            sessionId: id,
            errorTypes: z.array(error).max(7),
            answerSeenBeforeSubmit: z.boolean(),
          })
          .strict(),
      )
      .max(100000),
    learnEvents: z
      .array(z.object({ id, conceptId: id, readAt: date }).strict())
      .max(30000),
    queues: z
      .array(
        z
          .object({
            id,
            date: day,
            day: z.number().int().min(1).max(15),
            tasks: z
              .array(
                z
                  .object({
                    id,
                    kind: z.enum(["lesson", "question", "exam", "exam_review"]),
                    conceptId: id.optional(),
                    questionId: id.optional(),
                    examLabel: id.optional(),
                    examId: id.optional(),
                    minutes: z.number().nonnegative().max(600),
                    reason: z.string().max(1000),
                    completedAt: date.optional(),
                  })
                  .strict(),
              )
              .max(500),
            contentVersion: id,
            createdAt: date,
            unassignedCore: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(2000),
    practices: z
      .array(
        z
          .object({
            id,
            questionIds: z.array(id).max(300),
            index: z.number().int().nonnegative().max(300),
            mode: z.enum(["practice", "number"]),
            createdAt: date,
            finishedAt: date.optional(),
          })
          .strict(),
      )
      .max(10000),
    exams: z
      .array(
        z
          .object({
            id,
            label: id,
            questions: z.array(question).min(1).max(100),
            answers: z.record(z.string(), id),
            marked: z.array(id).max(100),
            index: z.number().int().min(0).max(99),
            startedAt: date,
            deadlineAt: date,
            submittedAt: date.optional(),
            unseenFamilyRatio: z.number().min(0).max(1),
            contentVersion: id,
            name: z.string().max(100),
            durationMinutes: z.number().int().min(10).max(180),
            kind: z.literal("practice_paper"),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export function parseRecord(text: string, c: Content): StudyState {
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024)
    throw Error("檔案超過20MB，請使用較小的備份。");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Error("不是有效的JSON紀錄檔。");
  }
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success)
    throw Error(
      "紀錄格式或版本不相容：" + parsed.error.issues[0].path.join("."),
    );
  const s = parsed.data as StudyState;
  for (const collection of [
    s.attempts,
    s.learnEvents,
    s.queues,
    s.practices,
    s.exams,
  ])
    if (new Set(collection.map((x) => x.id)).size !== collection.length)
      throw Error("紀錄含重複識別碼，請確認備份。");
  for (const a of s.attempts) {
    const q = c.questions.find(
      (q) => q.id === a.questionId && q.version === a.questionVersion,
    );
    if (q) {
      if (
        a.selectedOptionId !== null &&
        !q.options.some((o) => o.id === a.selectedOptionId)
      )
        throw Error("作答選項無效。");
      a.correct = a.selectedOptionId === q.correctOptionId;
      a.conceptId = q.conceptId;
      a.familyId = q.familyId;
    }
    a.localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(a.answeredAt));
  }
  for (const e of s.exams) {
    if (Date.parse(e.deadlineAt) <= Date.parse(e.startedAt))
      throw Error("模考時間無效。");
    if (new Set(e.questions.map((q) => q.id)).size !== e.questions.length)
      throw Error("模考含重複題。");
    for (const q of e.questions) {
      if (
        !q.options.some((o) => o.id === q.correctOptionId) ||
        new Set(q.options.map((o) => o.id)).size !== 4
      )
        throw Error("模考題目格式無效。");
      const current = c.questions.find(
        (x) => x.id === q.id && x.version === q.version,
      );
      if (
        current &&
        (q.correctOptionId !== current.correctOptionId ||
          q.stem !== current.stem)
      )
        throw Error("模考題目與目前版本不符。");
    }
    for (const [qid, option] of Object.entries(e.answers)) {
      const q = e.questions.find((q) => q.id === qid);
      if (!q?.options.some((o) => o.id === option))
        throw Error("模考答案無效。");
    }
    if (e.index >= e.questions.length) throw Error("模考題號無效。");
  }
  return s;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function mergeRecords(
  current: StudyState,
  incoming: StudyState,
): StudyState {
  const result = structuredClone(current);
  for (const key of [
    "attempts",
    "learnEvents",
    "queues",
    "practices",
    "exams",
  ] as const) {
    const map = new Map<string, unknown>(current[key].map((x) => [x.id, x]));
    for (const item of incoming[key]) {
      const old = map.get(item.id);
      if (old && canonical(old) !== canonical(item))
        throw Error(
          "同一筆紀錄有不同內容，請使用取代或另一份備份，避免默默覆寫。",
        );
      map.set(item.id, item);
    }
    (result[key] as unknown[]) = Array.from(map.values());
  }
  return result;
}
