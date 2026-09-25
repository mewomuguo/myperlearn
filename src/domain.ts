import type {
  Attempt,
  Concept,
  Content,
  Exam,
  Question,
  Queue,
  StudyState,
  Task,
} from "./types";
export const uid = () => crypto.randomUUID();
export function localDate(time = new Date(), timezone = "Asia/Taipei") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function dayDiff(a: string, b: string) {
  return Math.round(
    (Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000,
  );
}
export function addDays(d: string, n: number) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function planDay(s: StudyState, now = new Date()) {
  return Math.max(
    1,
    Math.min(
      15,
      dayDiff(localDate(now, s.settings.timezone), s.settings.planStartDate) +
        1,
    ),
  );
}
export function initialState(version: string): StudyState {
  return {
    schemaVersion: "1.0.0",
    kind: "record_export",
    contentVersion: version,
    revision: 0,
    settings: {
      profileId: uid(),
      planStartDate: localDate(),
      examDate: null,
      dailyMinutes: 180,
      timezone: "Asia/Taipei",
      setupComplete: false,
      examName: "人身保險講義綜合練習",
      examMinutes: 60,
      examQuestions: 40,
      updatedAt: new Date().toISOString(),
    },
    attempts: [],
    learnEvents: [],
    queues: [],
    practices: [],
    exams: [],
  };
}
export function validAttempts(s: StudyState, c: Content) {
  const q = new Map(c.questions.map((x) => [x.id, x]));
  return s.attempts.filter((a) => {
    const item = q.get(a.questionId);
    return (
      item &&
      item.status === "source_checked" &&
      a.questionVersion === item.version &&
      a.conceptId === item.conceptId &&
      a.correct === (a.selectedOptionId === item.correctOptionId)
    );
  });
}
export function independent(s: StudyState, c: Content) {
  const seen = new Set<string>();
  return validAttempts(s, c)
    .slice()
    .sort(
      (a, b) =>
        a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id),
    )
    .filter((a) => {
      const key = a.localDate + ":" + a.familyId;
      if (a.answerSeenBeforeSubmit || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function conceptStatus(
  s: StudyState,
  c: Content,
  id: string,
  now = new Date(),
) {
  const all = validAttempts(s, c).filter((a) => a.conceptId === id),
    a = independent(s, c).filter((a) => a.conceptId === id),
    recent = a.slice(-5),
    read = s.learnEvents.some((x) => x.conceptId === id),
    learned = read && all.length > 0;
  const accuracy = recent.length
    ? recent.filter((x) => x.correct).length / recent.length
    : null;
  const mastered =
    learned &&
    a.length >= 3 &&
    new Set(a.map((x) => x.familyId)).size >= 2 &&
    new Set(a.map((x) => x.localDate)).size >= 2 &&
    (accuracy ?? 0) >= 0.8;
  const last = a.at(-1),
    correctDays = new Set(a.filter((x) => x.correct).map((x) => x.localDate))
      .size;
  const interval = last?.correct
    ? correctDays >= 3
      ? 7
      : correctDays >= 2
        ? 3
        : 1
    : 1;
  const firstRead = s.learnEvents
    .filter((x) => x.conceptId === id)
    .sort((a, b) => a.readAt.localeCompare(b.readAt))[0];
  const nextReview = last
    ? addDays(last.localDate, interval)
    : firstRead
      ? addDays(localDate(new Date(firstRead.readAt), s.settings.timezone), 1)
      : null;
  const overdue = nextReview
    ? Math.max(0, dayDiff(localDate(now, s.settings.timezone), nextReview))
    : 0;
  const wrongIndex = a.findLastIndex((x) => !x.correct),
    lastWrong = wrongIndex >= 0 ? a[wrongIndex] : undefined;
  const recover = lastWrong
    ? a
        .slice(wrongIndex + 1)
        .filter((x) => x.correct && x.localDate > lastWrong.localDate)
    : [];
  const resolved =
    !!lastWrong &&
    new Set(recover.map((x) => x.localDate)).size >= 2 &&
    new Set(recover.map((x) => x.familyId)).size >= 2;
  const mistake = lastWrong
    ? resolved
      ? "resolved"
      : recover.length
        ? "recovering"
        : "open"
    : null;
  const numericIds = new Set(
    c.questions.filter((x) => x.numeric).map((x) => x.id),
  );
  const nums = a.filter((x) => numericIds.has(x.questionId)).slice(-5);
  const numberMastered =
    nums.length >= 3 &&
    new Set(nums.map((x) => x.familyId)).size >= 2 &&
    new Set(nums.map((x) => x.localDate)).size >= 2 &&
    nums.filter((x) => x.correct).length / nums.length >= 0.8;
  return {
    read,
    learned,
    mastered,
    accuracy,
    attempts: a,
    recent,
    nextReview,
    overdue,
    interval,
    mistake,
    lastWrong,
    recover,
    numberMastered,
  };
}
export function weight(c: Content, concept: Concept) {
  return Math.max(
    c.chapters.find((x) => x.id === concept.chapterId)!.importanceScore / 100,
    concept.priority === "MUST"
      ? 0.6
      : concept.priority === "SHOULD"
        ? 0.3
        : 0.1,
  );
}
export function weakPoints(s: StudyState, c: Content, now = new Date()) {
  return c.concepts
    .map((concept) => {
      const st = conceptStatus(s, c, concept.id, now);
      const a = st.attempts
        .filter(
          (x) =>
            dayDiff(localDate(now, s.settings.timezone), x.localDate) <= 14,
        )
        .slice(-10);
      const errors = a.filter((x) => !x.correct).length;
      const score =
        weight(c, concept) *
        ((errors + 1) / (a.length + 2)) *
        (1 + Math.min(st.overdue / Math.max(st.interval, 1), 1)) *
        (1 + Math.min(concept.chapterQuestionNumbers.length, 5) / 5);
      return { concept, ...st, score, errors, sample: a.length };
    })
    .filter((x) => x.read || x.attempts.length)
    .sort((a, b) => b.score - a.score);
}
export function readiness(s: StudyState, c: Content) {
  const core = c.concepts.filter((x) => x.priority === "MUST"),
    total = core.reduce((n, x) => n + weight(c, x), 0);
  let mastery = 0,
    accuracy = 0,
    numbers = 0,
    numberTotal = 0,
    learned = 0,
    measured = 0;
  const stats = core.map((x) => ({ x, st: conceptStatus(s, c, x.id) }));
  for (const { x, st } of stats) {
    const w = weight(c, x);
    if (st.mastered) mastery += w;
    if (st.learned) learned++;
    if (st.accuracy !== null) {
      accuracy += w * st.accuracy;
      measured++;
    }
    if (x.tags.includes("數字／期限")) {
      numberTotal += w;
      if (st.numberMastered) numbers += w;
    }
  }
  // Retest denominator uses the first cross-day retest after a wrong episode, not latest wrong -> future impossible.
  const retries = c.concepts.flatMap((x) => {
    const a = conceptStatus(s, c, x.id).attempts;
    let result: Attempt | undefined;
    for (let i = 0; i < a.length; i++)
      if (!a[i].correct) {
        const retry = a.slice(i + 1).find((y) => y.localDate > a[i].localDate);
        if (retry) result = retry;
      }
    return result ? [result] : [];
  });
  const repeatError = retries.length
    ? retries.filter((x) => !x.correct).length / retries.length
    : null;
  const parts = [
    { name: "核心考點掌握", value: total ? mastery / total : 0, max: 25 },
    { name: "核心題正確率", value: total ? accuracy / total : 0, max: 25 },
    { name: "正式模考證據", value: 0, max: 25 },
    {
      name: "錯題修正",
      value: repeatError === null ? 0 : 1 - repeatError,
      max: 15,
    },
    {
      name: "必背數字掌握",
      value: numberTotal ? numbers / numberTotal : 0,
      max: 10,
    },
  ];
  return {
    score: Math.round(parts.reduce((n, x) => n + x.value * x.max, 0)),
    parts,
    learned,
    coreCount: core.length,
    mastered: stats.filter((x) => x.st.mastered).length,
    measured,
    repeatError,
    provisional: true,
  };
}
export function shuffled<T>(a: T[]): T[] {
  const result = [...a];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function pickQuestions(
  s: StudyState,
  c: Content,
  ids: string[],
  count: number,
  numeric = false,
) {
  const counts = new Map<string, number>();
  for (const a of s.attempts)
    counts.set(a.familyId, (counts.get(a.familyId) || 0) + 1);
  return shuffled(
    c.questions.filter(
      (q) =>
        q.status === "source_checked" &&
        ids.includes(q.conceptId) &&
        (!numeric || q.numeric),
    ),
  )
    .sort(
      (a, b) => (counts.get(a.familyId) || 0) - (counts.get(b.familyId) || 0),
    )
    .slice(0, count);
}
export function generateQueue(
  s: StudyState,
  c: Content,
  now = new Date(),
): Queue {
  const date = localDate(now, s.settings.timezone),
    day = planDay(s, now),
    plan = c.plans[day - 1],
    tasks: Task[] = [];
  const used = new Set<string>();
  let budget = s.settings.dailyMinutes;
  let missing = 0;
  const addQ = (q: Question, reason: string) => {
    if (used.has(q.id) || budget < 3) return;
    used.add(q.id);
    tasks.push({
      id: uid(),
      kind: "question",
      questionId: q.id,
      conceptId: q.conceptId,
      minutes: 3,
      reason,
    });
    budget -= 3;
  };
  const weak = weakPoints(s, c, now).filter(w => day !== 15 || w.concept.tags.includes('必背') || w.concept.tags.includes('數字／期限') || w.attempts.filter(a => !a.correct).length >= 2);
  if (day > 1)
    for (const w of weak
      .filter((x) => x.mistake && x.mistake !== "resolved")
      .slice(0, 5))
      for (const q of pickQuestions(s, c, [w.concept.id], 1))
        addQ(q, "錯題再確認");
  if (day > 1)
    for (const w of weak
      .filter((x) => x.nextReview && x.nextReview <= date)
      .slice(0, 5))
      for (const q of pickQuestions(s, c, [w.concept.id], 1))
        addQ(q, "到期複習");
  const addLesson = (concept: Concept, reason: string) => {
    if (tasks.some((x) => x.kind === "lesson" && x.conceptId === concept.id))
      return;
    const q = pickQuestions(s, c, [concept.id], 1)[0];
    if (!q || concept.issue) {
      missing++;
      return;
    }
    if (budget < 8) {
      missing++;
      return;
    }
    tasks.push({
      id: uid(),
      kind: "lesson",
      conceptId: concept.id,
      minutes: 5,
      reason,
    });
    budget -= 5;
    addQ(q, "學完立即練習");
  };
  if (day <= 11) {
    const selected = c.concepts
      .filter(
        (x) =>
          x.priority === "MUST" &&
          x.firstDay <= day &&
          !conceptStatus(s, c, x.id).learned,
      )
      .sort((a, b) => a.firstDay - b.firstDay || weight(c, b) - weight(c, a));
    const visited = new Set<string>();
    const visit = (x: Concept) => {
      if (visited.has(x.id)) return;
      visited.add(x.id);
      for (const id of x.prerequisiteIds) {
        const p = c.concepts.find((y) => y.id === id);
        if (p && !conceptStatus(s, c, id).learned) visit(p);
      }
      addLesson(x, x.firstDay < day ? "補齊尚未完成核心" : "今日核心");
    };
    selected.forEach(visit);
  }
  if (day === 13) {
    for (const w of weak.filter((x) => !x.mastered).slice(0, 3))
      addLesson(w.concept, "弱點重學");
    for (const x of c.concepts
      .filter(
        (x) => x.priority === "MUST" && !conceptStatus(s, c, x.id).learned,
      )
      .slice(0, 3))
      addLesson(x, "核心補缺");
  }
  for (const label of plan.examLabels) {
    tasks.push({
      id: uid(),
      kind: "exam",
      examLabel: label,
      minutes: s.settings.examMinutes,
      reason: "完整限時練習卷",
    });
    tasks.push({
      id: uid(),
      kind: "exam_review",
      examLabel: label,
      minutes: 30,
      reason: "逐題檢討與錯因整理",
    });
    budget -= s.settings.examMinutes + 30;
  }
  const learnedIds = c.concepts
    .filter(
      (x) =>
        conceptStatus(s, c, x.id).read ||
        tasks.some((t) => t.kind === "lesson" && t.conceptId === x.id),
    )
    .map((x) => x.id);
  if (day >= 2)
    for (const q of pickQuestions(
      s,
      c,
      learnedIds,
      Math.min(5, Math.max(0, Math.floor(budget / 3))),
      true,
    ))
      addQ(q, "數字／期限回想");
  const weakIds = weak.slice(0, 3).map((x) => x.concept.id),
    availableIds =
      day === 15
        ? c.concepts
            .filter(
              (x) =>
                learnedIds.includes(x.id) &&
                (x.tags.includes("必背") ||
                  x.tags.includes("數字／期限") ||
                  weakIds.includes(x.id)),
            )
            .map((x) => x.id)
        : learnedIds;
  const remaining = Math.min(
    Math.max(0, Math.floor(budget / 3)),
    plan.targetQuestionsMax || 10,
  );
  const weakQs = pickQuestions(s, c, weakIds, Math.floor(remaining * 0.8));
  for (const q of weakQs) addQ(q, "弱點補強");
  for (const q of pickQuestions(s, c, availableIds, remaining))
    addQ(q, "混合檢核");
  return {
    id: uid(),
    date,
    day,
    tasks,
    contentVersion: c.version,
    createdAt: now.toISOString(),
    unassignedCore: missing,
  };
}
export function makeAttempt(
  q: Question,
  answer: string | null,
  sessionId: string,
  mode: Attempt["mode"],
  now = new Date(),
  durationMs = 0,
): Attempt {
  return {
    id: uid(),
    questionId: q.id,
    questionVersion: q.version,
    familyId: q.familyId,
    conceptId: q.conceptId,
    selectedOptionId: answer,
    correct: answer === q.correctOptionId,
    answeredAt: now.toISOString(),
    localDate: localDate(now),
    durationMs,
    mode,
    sessionId,
    errorTypes: answer === q.correctOptionId ? [] : ["未分類"],
    answerSeenBeforeSubmit: false,
  };
}
export function createExam(
  s: StudyState,
  c: Content,
  label: string,
  now = new Date(),
): Exam {
  const count = s.settings.examQuestions;
  const perUnit = [Math.ceil(count / 2), Math.floor(count / 2)];
  const selected: Question[] = [];
  for (const [index, prefix] of ["P", "L"].entries()) {
    const ids = c.concepts
      .filter((x) => x.chapterId.startsWith(prefix))
      .map((x) => x.id);
    const qs = pickQuestions(s, c, ids, perUnit[index]);
    if (qs.length < perUnit[index])
      throw Error(
        `${prefix === "P" ? "實務" : "法規"}題量不足，請減少練習題數。`,
      );
    selected.push(...qs);
  }
  const families = new Set(s.attempts.map((x) => x.familyId));
  return {
    id: uid(),
    label,
    questions: shuffled(selected).map((q) => ({
      ...q,
      options: shuffled(q.options),
    })),
    answers: {},
    marked: [],
    index: 0,
    startedAt: now.toISOString(),
    deadlineAt: new Date(
      now.getTime() + s.settings.examMinutes * 60000,
    ).toISOString(),
    unseenFamilyRatio:
      selected.filter((x) => !families.has(x.familyId)).length /
      selected.length,
    contentVersion: c.version,
    name: s.settings.examName,
    durationMinutes: s.settings.examMinutes,
    kind: "practice_paper",
  };
}
export function submitExam(s: StudyState, id: string, now = new Date()) {
  const e = s.exams.find((x) => x.id === id);
  if (!e || e.submittedAt) return s;
  const submittedAt = now.toISOString();
  e.submittedAt = submittedAt;
  for (const q of e.questions)
    s.attempts.push(makeAttempt(q, e.answers[q.id] ?? null, id, "exam", now));
  return s;
}
export function examScore(e: Exam) {
  const correct = e.questions.filter(
    (q) => e.answers[q.id] === q.correctOptionId,
  ).length;
  return {
    correct,
    total: e.questions.length,
    percent: Math.round((correct / e.questions.length) * 100),
    unanswered: e.questions.filter((q) => !e.answers[q.id]).length,
  };
}
