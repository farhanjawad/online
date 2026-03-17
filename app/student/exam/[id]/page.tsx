"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getScheduledExam, saveExamResult, hasStudentAttempted } from "@/lib/firestore";
import type { ScheduledExam, PreparedQuestion, ExamResult } from "@/lib/types";
import { getExamStatus, getExamEndMs, getExamStartMs } from "@/lib/types";
import QuestionCard from "@/components/QuestionCard";
import CountdownTimer from "@/components/CountdownTimer";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertTriangle,
  CheckCircle,
  Loader,
  LayoutGrid,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ExamPhase = "loading" | "blocked" | "ready" | "active" | "submitted";

// ─────────────────────────────────────────────────────────────────────────────
// Score Calculator
// ─────────────────────────────────────────────────────────────────────────────
function calculateScore(
  questions: PreparedQuestion[],
  answers: Record<string, number>,
  negativeMarking: number
): { score: number; correct: number; wrong: number; attempted: number } {
  let correct = 0;
  let wrong = 0;
  let attempted = 0;

  for (const q of questions) {
    const selected = answers[q._key];
    if (selected === undefined) continue;
    attempted++;
    if (selected === q.correctIndex) {
      correct++;
    } else {
      wrong++;
    }
  }

  const score = Math.max(0, correct - wrong * negativeMarking);
  return { score, correct, wrong, attempted };
}

// ─────────────────────────────────────────────────────────────────────────────
// Question Navigator Panel
// ─────────────────────────────────────────────────────────────────────────────
function QuestionNavigator({
  questions,
  answers,
  currentIndex,
  onJump,
  isSubmitted,
}: {
  questions: PreparedQuestion[];
  answers: Record<string, number>;
  currentIndex: number;
  onJump: (i: number) => void;
  isSubmitted: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--text-muted)" }}
      >
        Questions
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {questions.map((q, i) => {
          const selected = answers[q._key];
          const isAnswered = selected !== undefined;
          const isCurrent = i === currentIndex;
          const isCorrect = isSubmitted && selected === q.correctIndex;
          const isWrong =
            isSubmitted && selected !== undefined && selected !== q.correctIndex;

          let bg = "var(--bg-elevated)";
          let color = "var(--text-muted)";
          let border = "1px solid var(--border-subtle)";

          if (isCurrent && !isSubmitted) {
            bg = "var(--accent-glow)";
            color = "var(--accent)";
            border = "1px solid var(--accent)";
          } else if (isSubmitted && isCorrect) {
            bg = "rgba(16,185,129,0.1)";
            color = "var(--success)";
            border = "1px solid var(--success)";
          } else if (isSubmitted && isWrong) {
            bg = "rgba(239,68,68,0.1)";
            color = "var(--danger)";
            border = "1px solid var(--danger)";
          } else if (!isSubmitted && isAnswered) {
            bg = "var(--cyan-glow)";
            color = "var(--cyan)";
            border = "1px solid var(--cyan)";
          } else if (isCurrent) {
            bg = "var(--accent-glow)";
            color = "var(--accent)";
            border = "1px solid var(--accent)";
          }

          return (
            <button
              key={q._key}
              onClick={() => onJump(i)}
              className="aspect-square rounded-lg text-xs font-bold font-mono-exam transition-all"
              style={{ background: bg, color, border }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      {!isSubmitted && (
        <div className="mt-4 space-y-1.5">
          {[
            { color: "var(--cyan)", label: "Answered" },
            { color: "var(--text-muted)", label: "Unanswered" },
            { color: "var(--accent)", label: "Current" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ background: color, opacity: 0.7 }}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Summary Panel (shown after submission)
// ─────────────────────────────────────────────────────────────────────────────
function ResultSummary({
  questions,
  answers,
  score,
  correct,
  wrong,
  attempted,
  timeTaken,
  onReview,
}: {
  questions: PreparedQuestion[];
  answers: Record<string, number>;
  score: number;
  correct: number;
  wrong: number;
  attempted: number;
  timeTaken: number;
  onReview: () => void;
}) {
  const total = questions.length;
  const percentage = ((score / total) * 100).toFixed(1);

  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
        style={{
          background: parseFloat(percentage) >= 50
            ? "rgba(16,185,129,0.1)"
            : "rgba(239,68,68,0.1)",
          border: `3px solid ${parseFloat(percentage) >= 50 ? "var(--success)" : "var(--danger)"}`,
        }}
      >
        <span
          className="text-2xl font-bold font-mono-exam"
          style={{
            color:
              parseFloat(percentage) >= 50 ? "var(--success)" : "var(--danger)",
          }}
        >
          {percentage}%
        </span>
      </div>

      <h2
        className="text-2xl font-bold mb-2"
        style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
      >
        {parseFloat(percentage) >= 75
          ? "Excellent Work!"
          : parseFloat(percentage) >= 50
          ? "Good Effort!"
          : "Keep Practicing!"}
      </h2>

      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        You scored <strong style={{ color: "var(--accent)" }}>{score.toFixed(2)}</strong> out of{" "}
        <strong>{total}</strong> points
      </p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Correct", value: correct, color: "var(--success)" },
          { label: "Wrong", value: wrong, color: "var(--danger)" },
          { label: "Skipped", value: total - attempted, color: "var(--text-muted)" },
          {
            label: "Time",
            value: `${Math.floor(timeTaken / 60)}m`,
            color: "var(--accent)",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl py-3 px-2"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <p className="text-lg font-bold font-mono-exam" style={{ color }}>
              {value}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={onReview}
        className="flex items-center gap-2 mx-auto px-6 py-2.5 rounded-xl font-medium text-sm transition-all"
        style={{ background: "var(--accent)", color: "#000" }}
      >
        <LayoutGrid size={15} />
        Review All Answers
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Exam Arena Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ExamArenaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 15: use() to unwrap Promise params
  const { id } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<ExamPhase>("loading");
  const [exam, setExam] = useState<ScheduledExam | null>(null);
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blockReason, setBlockReason] = useState("");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // Result state
  const [resultData, setResultData] = useState<{
    score: number; correct: number; wrong: number; attempted: number; timeTaken: number;
  } | null>(null);

  const examStartTimeRef = useRef<number>(Date.now());
  const studentId = useRef<string>("");

  // ── Load Exam Config & Guard ──────────────────────────────────────────────
  useEffect(() => {
    const sid = sessionStorage.getItem("exam_student_id");
    if (!sid) {
      router.replace("/student");
      return;
    }
    studentId.current = sid;

    const init = async () => {
      // ── Validate Firebase config before any Firestore call ───────────────
      if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
        setBlockReason(
          "Firebase is not configured. Copy .env.local.example to .env.local and fill in your Firebase credentials."
        );
        setPhase("blocked");
        return;
      }

      try {
        const examData = await getScheduledExam(id);
        if (!examData) {
          setBlockReason("Exam not found. The exam ID may be incorrect or it was deleted.");
          setPhase("blocked");
          return;
        }
        setExam(examData);

        const status = getExamStatus(examData);

        if (status === "upcoming") {
          setBlockReason("This exam has not started yet.");
          setPhase("blocked");
          return;
        }
        if (status === "ended") {
          setBlockReason("This exam has ended.");
          setPhase("blocked");
          return;
        }

        // Check if already attempted
        const alreadyDone = await hasStudentAttempted(id, sid);
        if (alreadyDone) {
          setBlockReason("You have already submitted this exam.");
          setPhase("blocked");
          return;
        }

        setPhase("ready");
      } catch (err: unknown) {
        console.error("[ExamArena] init error:", err);

        // Parse Firebase/Firestore specific error codes for actionable messages
        const code = (err as { code?: string })?.code ?? "";
        const message = (err as { message?: string })?.message ?? "";

        let reason = "Failed to load exam.";

        if (code === "permission-denied" || message.includes("permission-denied")) {
          reason =
            "Permission denied by Firestore. Deploy the security rules: run `firebase deploy --only firestore:rules` or paste firestore.rules into the Firebase Console.";
        } else if (code === "failed-precondition" || message.includes("index")) {
          reason =
            "A Firestore index is missing. Open the Firebase Console link in your browser console to create it automatically, then reload.";
        } else if (
          code === "unavailable" ||
          message.includes("network") ||
          message.includes("fetch")
        ) {
          reason = "Network error — cannot reach Firebase. Check your internet connection.";
        } else if (message.includes("api-key") || message.includes("API key")) {
          reason = "Invalid Firebase API key in .env.local. Double-check NEXT_PUBLIC_FIREBASE_API_KEY.";
        } else if (message) {
          reason = `Firestore error: ${message}`;
        }

        setBlockReason(reason);
        setPhase("blocked");
      }
    };

    init();
  }, [id, router]);

  // ── Load Questions ────────────────────────────────────────────────────────
  const loadQuestions = useCallback(async () => {
    if (!exam) return;
    setPhase("loading");
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: exam.examSources,
          totalQuestions: exam.totalQuestions,
          strategy: exam.strategy ?? "pool",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Surface the specific API error message
        throw new Error(
          data?.error ??
            `Questions API returned ${res.status}. Check that your JSON files exist in /data/ and are named exactly as configured (e.g. "set-1.json").`
        );
      }

      if (!data.questions || data.questions.length === 0) {
        throw new Error(
          "No questions were loaded. Ensure your JSON files are in /data/, use the exact filenames you entered in the admin (e.g. set-1.json), and that correct_answer_html matches one of the options."
        );
      }

      setQuestions(data.questions);
      examStartTimeRef.current = Date.now();
      setPhase("active");
    } catch (err) {
      console.error("[ExamArena] loadQuestions error:", err);
      setBlockReason(
        err instanceof Error ? err.message : "Failed to load questions. Check the browser console for details."
      );
      setPhase("blocked");
    }
  }, [exam]);

  useEffect(() => {
    if (phase === "ready") {
      loadQuestions();
    }
  }, [phase, loadQuestions]);

  // ── Handle Answer Selection (locked after first pick) ─────────────────────
  const handleSelect = useCallback((questionKey: string, optionIndex: number) => {
    setAnswers((prev) => {
      if (prev[questionKey] !== undefined) return prev; // immutable after first selection
      return { ...prev, [questionKey]: optionIndex };
    });
  }, []);

  // ── Submit Exam ───────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (submissionType: "manual" | "auto") => {
      if (!exam || phase !== "active") return;
      setSubmitting(true);

      const timeTakenSeconds = Math.floor(
        (Date.now() - examStartTimeRef.current) / 1000
      );

      const { score, correct, wrong, attempted } = calculateScore(
        questions,
        answers,
        exam.negativeMarking
      );

      const result: Omit<ExamResult, "id"> = {
        examId: id,
        examTitle: exam.title,
        studentId: studentId.current,
        answers,
        score,
        totalQuestions: questions.length,
        attempted,
        correct,
        wrong,
        timeTakenSeconds,
        submittedAt: Date.now(),
        submissionType,
      };

      try {
        await saveExamResult(result);
      } catch (err) {
        console.error("Failed to save result:", err);
        // Still show local result even if save fails
      }

      setResultData({ score, correct, wrong, attempted, timeTaken: timeTakenSeconds });
      setSubmitting(false);
      setShowSubmitConfirm(false);
      setPhase("submitted");
    },
    [exam, phase, questions, answers, id]
  );

  // Timer expiry
  const handleTimerExpire = useCallback(() => {
    if (phase === "active") handleSubmit("auto");
  }, [phase, handleSubmit]);

  // Navigation
  const goNext = () =>
    setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  const answeredCount = Object.keys(answers).length;
  const endMs = exam ? getExamEndMs(exam) : Date.now() + 3600000;

  // ── Render Phases ─────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-4 animate-spin"
            style={{ borderColor: "var(--cyan)", borderTopColor: "transparent" }}
          />
          <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
            Preparing your exam...
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Randomizing question sets
          </p>
        </div>
      </div>
    );
  }

  if (phase === "blocked") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid var(--danger)",
            }}
          >
            <AlertTriangle size={28} style={{ color: "var(--danger)" }} />
          </div>
          <h2
            className="text-2xl font-bold mb-3"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            Access Denied
          </h2>
          <p className="mb-8" style={{ color: "var(--text-secondary)" }}>
            {blockReason}
          </p>
          <button
            onClick={() => router.push("/student")}
            className="px-6 py-2.5 rounded-xl font-medium text-sm"
            style={{ background: "var(--cyan)", color: "#000" }}
          >
            ← Back to Portal
          </button>
        </div>
      </div>
    );
  }

  // ── Submitted Phase ───────────────────────────────────────────────────────
  if (phase === "submitted" && resultData) {
    return (
      <div className="min-h-screen grid-pattern">
        {/* Header */}
        <header
          className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
          style={{
            background: "rgba(8,11,18,0.9)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "var(--cyan)" }}
            >
              <BookOpen size={16} color="#000" />
            </div>
            <span style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontWeight: 700 }}>
              {exam?.title}
            </span>
          </div>
          <span
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full"
            style={{
              background: "rgba(16,185,129,0.1)",
              color: "var(--success)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            <CheckCircle size={14} />
            Submitted
          </span>
        </header>

        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Result Summary */}
            <div className="lg:col-span-1">
              <ResultSummary
                questions={questions}
                answers={answers}
                {...resultData}
                onReview={() => setShowReview(true)}
              />
              <button
                onClick={() => router.push("/student")}
                className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                ← Back to Portal
              </button>
            </div>

            {/* Right: Review Questions */}
            {showReview && (
              <div className="lg:col-span-2 space-y-4">
                <h3
                  className="text-lg font-bold"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                >
                  Answer Review
                </h3>
                {questions.map((q, i) => (
                  <QuestionCard
                    key={q._key}
                    question={q}
                    questionNumber={i + 1}
                    selectedIndex={answers[q._key] ?? null}
                    onSelect={() => {}}
                    isSubmitted={true}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Active Exam Phase ─────────────────────────────────────────────────────
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion || !exam) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 px-4 md:px-6 py-3"
        style={{
          background: "rgba(8,11,18,0.92)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Title + Progress */}
          <div className="min-w-0">
            <p
              className="font-bold text-sm truncate"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              {exam.title}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Q{currentIndex + 1}/{questions.length} ·{" "}
              <span style={{ color: "var(--cyan)" }}>{answeredCount} answered</span>
            </p>
          </div>

          {/* Center: Timer */}
          <CountdownTimer
            targetMs={endMs}
            onExpire={handleTimerExpire}
            variant="exam-header"
          />

          {/* Right: Submit */}
          <button
            onClick={() => setShowSubmitConfirm(true)}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            <Send size={14} />
            <span className="hidden sm:inline">Submit</span>
          </button>
        </div>

        {/* Progress Bar */}
        <div
          className="mt-2.5 max-w-7xl mx-auto h-1 rounded-full overflow-hidden"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(answeredCount / questions.length) * 100}%`,
              background: "var(--cyan)",
            }}
          />
        </div>
      </header>

      {/* ── Main Layout ───────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex gap-6">
        {/* Left: Question Area */}
        <div className="flex-1 min-w-0">
          <QuestionCard
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            selectedIndex={answers[currentQuestion._key] ?? null}
            onSelect={(optIdx) => handleSelect(currentQuestion._key, optIdx)}
            isSubmitted={false}
          />

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "var(--bg-elevated)",
                color: currentIndex === 0 ? "var(--text-muted)" : "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
                opacity: currentIndex === 0 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <span
              className="font-mono-exam text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              {currentIndex + 1} / {questions.length}
            </span>

            <button
              onClick={goNext}
              disabled={currentIndex === questions.length - 1}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "var(--bg-elevated)",
                color:
                  currentIndex === questions.length - 1
                    ? "var(--text-muted)"
                    : "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
                opacity: currentIndex === questions.length - 1 ? 0.5 : 1,
              }}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Right: Navigator Panel (hidden on mobile) */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-28">
            <QuestionNavigator
              questions={questions}
              answers={answers}
              currentIndex={currentIndex}
              onJump={setCurrentIndex}
              isSubmitted={false}
            />

            {/* Quick Submit in sidebar */}
            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="mt-4 w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              <Send size={14} />
              Submit Exam
            </button>
          </div>
        </aside>
      </div>

      {/* ── Submit Confirmation Modal ─────────────────────────────────────── */}
      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-8"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{
                background: "var(--accent-glow)",
                border: "1px solid var(--accent)",
              }}
            >
              <Send size={24} style={{ color: "var(--accent)" }} />
            </div>

            <h3
              className="text-xl font-bold text-center mb-2"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              Submit Exam?
            </h3>

            <p
              className="text-sm text-center mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              You have answered{" "}
              <strong style={{ color: "var(--cyan)" }}>{answeredCount}</strong> of{" "}
              <strong>{questions.length}</strong> questions.
            </p>

            {answeredCount < questions.length && (
              <p
                className="text-sm text-center mb-6 flex items-center justify-center gap-2"
                style={{ color: "var(--warning)" }}
              >
                <AlertTriangle size={14} />
                {questions.length - answeredCount} questions left unanswered.
              </p>
            )}

            <p
              className="text-xs text-center mb-8"
              style={{ color: "var(--text-muted)" }}
            >
              This action cannot be undone. Your answers will be saved permanently.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit("manual")}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                style={{
                  background: submitting ? "var(--accent-dim)" : "var(--accent)",
                  color: "#000",
                }}
              >
                {submitting ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Confirm Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
