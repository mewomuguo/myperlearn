export type Priority = "MUST" | "SHOULD" | "OPTIONAL";
export type ErrorType =
  | "概念不懂"
  | "數字記錯"
  | "選項混淆"
  | "看錯題目"
  | "計算失誤"
  | "不確定／猜測"
  | "未分類";
export interface Chapter {
  id: string;
  title: string;
  unit: string;
  stars: number;
  questionCount: number;
  aPlusBlockCount: number;
  importanceScore: number;
  printedRange: number[];
}
export interface Concept {
  id: string;
  chapterId: string;
  title: string;
  priority: Priority;
  tags: string[];
  firstDay: number;
  printedPages: number[];
  pdfPages: number[];
  outcome: string;
  chapterQuestionNumbers: number[];
  aPlusPages: number[];
  relatedConceptIds: string[];
  prerequisiteIds: string[];
  priorityReason: string;
  lesson: { explanation: string; example: string; recall: string[] };
  issue?: string;
}
export interface Question {
  id: string;
  version: string;
  familyId: string;
  conceptId: string;
  stem: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  optionReasons: Record<string, string>;
  numeric: boolean;
  status: "source_checked" | "quarantined";
  sourcePages: number[];
  origin: "lecture_adapted";
  scope: "lecture_115_07";
}
export interface Plan {
  day: number;
  title: string;
  requiredConceptIds: string[];
  optionalConceptIds: string[];
  newLearningAllowed: boolean;
  learnMinutes: number;
  answerMinutes: number;
  reviewMinutes: number;
  targetQuestionsMin: number;
  targetQuestionsMax: number;
  fullExamCount: number;
  examLabels: string[];
  outcome: string;
}
export interface Content {
  version: string;
  chapters: Chapter[];
  concepts: Concept[];
  questions: Question[];
  plans: Plan[];
  sources: { title: string; url?: string; note: string }[];
}
export interface Settings {
  profileId: string;
  planStartDate: string;
  examDate: string | null;
  dailyMinutes: number;
  timezone: string;
  setupComplete: boolean;
  examName: string;
  examMinutes: number;
  examQuestions: number;
  updatedAt: string;
}
export interface Attempt {
  id: string;
  questionId: string;
  questionVersion: string;
  familyId: string;
  conceptId: string;
  selectedOptionId: string | null;
  correct: boolean;
  answeredAt: string;
  localDate: string;
  durationMs: number;
  mode: "practice" | "number" | "task" | "exam";
  sessionId: string;
  errorTypes: ErrorType[];
  answerSeenBeforeSubmit: boolean;
}
export interface LearnEvent {
  id: string;
  conceptId: string;
  readAt: string;
}
export interface Task {
  id: string;
  kind: "lesson" | "question" | "exam" | "exam_review";
  conceptId?: string;
  questionId?: string;
  examLabel?: string;
  examId?: string;
  minutes: number;
  reason: string;
  completedAt?: string;
}
export interface Queue {
  id: string;
  date: string;
  day: number;
  tasks: Task[];
  contentVersion: string;
  createdAt: string;
  unassignedCore: number;
}
export interface Practice {
  id: string;
  questionIds: string[];
  index: number;
  mode: "practice" | "number";
  createdAt: string;
  finishedAt?: string;
}
export interface Exam {
  id: string;
  label: string;
  questions: Question[];
  answers: Record<string, string>;
  marked: string[];
  index: number;
  startedAt: string;
  deadlineAt: string;
  submittedAt?: string;
  unseenFamilyRatio: number;
  contentVersion: string;
  name: string;
  durationMinutes: number;
  kind: "practice_paper";
}
export interface StudyState {
  schemaVersion: "1.0.0";
  kind: "record_export";
  contentVersion: string;
  revision: number;
  exportedAt?: string;
  settings: Settings;
  attempts: Attempt[];
  learnEvents: LearnEvent[];
  queues: Queue[];
  practices: Practice[];
  exams: Exam[];
}
