// ─────────────────────────────────────────────────────────────────────────────
// Core question structure matching the scraped JSON format
// ─────────────────────────────────────────────────────────────────────────────
export interface RawQuestion {
  question_html: string;
  options_html: string[];
  correct_answer_html: string;
  solution_html: string;
}

// Enriched question with computed metadata added at API layer
export interface PreparedQuestion extends RawQuestion {
  correctIndex: number;
  examSource: string;
  _key: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Randomization strategy for question selection
// ─────────────────────────────────────────────────────────────────────────────
/**
 * "pool"        — Combine ALL questions from every selected set into one pool,
 *                 shuffle the pool, then slice the first N.
 *                 Distribution across sets is random and uneven.
 *
 * "interleaved" — Shuffle each set INDEPENDENTLY, then round-robin pick:
 *                 1 from set-1, 1 from set-2, 1 from set-3, 1 from set-1, …
 *                 Guarantees even representation AND each set's questions are
 *                 in a completely different random order so the same position
 *                 is never the same question across sets.
 */
export type RandomizationStrategy = "pool" | "interleaved";

// ─────────────────────────────────────────────────────────────────────────────
// Admin Scheduled Exam (stored in Firestore: scheduled_exams)
// ─────────────────────────────────────────────────────────────────────────────
export interface ScheduledExam {
  id: string;
  title: string;
  date: string;         // ISO: "2025-06-15"
  startTime: string;    // 24h: "09:00"
  durationMinutes: number;
  examSources: string[];
  totalQuestions: number;
  negativeMarking: number;
  /** How questions are drawn from the selected sets */
  strategy: RandomizationStrategy;
  createdBy: string;
  createdAt: number;
}

export type CreateExamPayload = Omit<ScheduledExam, "id" | "createdBy" | "createdAt">;

// ─────────────────────────────────────────────────────────────────────────────
// Student Allowlist (Firestore: student_allowlist)
// Doc ID = studentId (uppercase) for O(1) lookup — no composite index needed
// ─────────────────────────────────────────────────────────────────────────────
export interface StudentAllowlistEntry {
  studentId: string;
  name: string;
  batch?: string;
  isActive: boolean;
  addedAt: number;
  addedBy: string;
}

export type CreateStudentPayload = Omit<StudentAllowlistEntry, "addedAt" | "addedBy">;

// ─────────────────────────────────────────────────────────────────────────────
// Student Session (stored in sessionStorage)
// ─────────────────────────────────────────────────────────────────────────────
export interface StudentSession {
  studentId: string;
  name: string;
  batch?: string;
  loginTime: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam Result (Firestore: exam_results)
// ─────────────────────────────────────────────────────────────────────────────
export interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  answers: Record<string, number>;
  score: number;
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  timeTakenSeconds: number;
  submittedAt: number;
  submissionType: "manual" | "auto";
}

// ─────────────────────────────────────────────────────────────────────────────
// Set scanner API types
// ─────────────────────────────────────────────────────────────────────────────
export interface SetInfo {
  value: string;        // e.g. "biology_set_1"
  label: string;        // e.g. "Set 1"
  subject: string;      // e.g. "biology"
  subjectLabel: string; // e.g. "Biology"
  setNumber: number;
}

export interface SubjectGroup {
  label: string;
  sets: SetInfo[];
}

export interface SetsApiResponse {
  groups: Record<string, SubjectGroup>;
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Payloads
// ─────────────────────────────────────────────────────────────────────────────
export interface QuestionApiRequest {
  sources: string[];
  totalQuestions: number;
  strategy: RandomizationStrategy;
}

export interface QuestionApiResponse {
  questions: PreparedQuestion[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam status helpers
// ─────────────────────────────────────────────────────────────────────────────
export type ExamStatus = "upcoming" | "live" | "ended";

export function getExamStatus(exam: ScheduledExam): ExamStatus {
  const now = Date.now();
  const start = getExamStartMs(exam);
  const end = start + exam.durationMinutes * 60 * 1000;
  if (now < start) return "upcoming";
  if (now < end) return "live";
  return "ended";
}

export function getExamStartMs(exam: ScheduledExam): number {
  const [hours, minutes] = exam.startTime.split(":").map(Number);
  const d = new Date(exam.date);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export function getExamEndMs(exam: ScheduledExam): number {
  return getExamStartMs(exam) + exam.durationMinutes * 60 * 1000;
}
