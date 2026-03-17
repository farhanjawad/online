"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAllScheduledExams, hasStudentAttempted } from "@/lib/firestore";
import type { ScheduledExam, StudentSession } from "@/lib/types";
import { getExamStatus, getExamStartMs, getExamEndMs } from "@/lib/types";
import CountdownTimer from "@/components/CountdownTimer";
import {
  GraduationCap,
  BookOpen,
  Clock,
  Calendar,
  ChevronRight,
  LogOut,
  CheckCircle,
  Lock,
  Zap,
  User,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Student Login Modal
// ─────────────────────────────────────────────────────────────────────────────
function StudentLogin({ onLogin }: { onLogin: (session: StudentSession) => void }) {
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: studentId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }
      const session: StudentSession = {
        studentId: data.studentId,
        name: data.name,
        batch: data.batch ?? undefined,
        loginTime: Date.now(),
      };
      sessionStorage.setItem("student_session", JSON.stringify(session));
      onLogin(session);
    } catch {
      setError("Cannot reach server. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid-pattern flex items-center justify-center px-4">
      <div
        className="absolute bottom-0 right-0 w-125 h-125 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at bottom right, rgba(34,211,238,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "var(--cyan-glow)",
                border: "1px solid var(--cyan)",
                boxShadow: "0 0 32px var(--cyan-glow)",
              }}
            >
              <GraduationCap size={28} style={{ color: "var(--cyan)" }} />
            </div>
          </div>
          <h1
            className="text-3xl font-bold mb-1"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            Student Portal
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Enter your student ID to access your exams
          </p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error message */}
            {error && (
              <div
                className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                }}
              >
                <span className="shrink-0 mt-0.5">✕</span>
                {error}
              </div>
            )}

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Student ID *
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => { setStudentId(e.target.value); setError(""); }}
                placeholder="e.g., 251212"
                required
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono-exam"
                style={{
                  background: "var(--bg-elevated)",
                  border: error ? "1px solid var(--danger)" : "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  textTransform: "uppercase",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--cyan)";
                  e.target.style.boxShadow = "0 0 0 3px var(--cyan-glow)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = error ? "var(--danger)" : "var(--border-subtle)";
                  e.target.style.boxShadow = "none";
                }}
              />
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                Your ID must be registered in the system by your administrator.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
              style={{
                background: loading ? "var(--cyan-dim)" : "var(--cyan)",
                color: "#000",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Signing in..." : "Access Exams"}
            </button>
          </form>
        </div>

        <button
          onClick={() => (window.location.href = "/")}
          className="mt-6 w-full text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to Home
        </button>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam Card
// ─────────────────────────────────────────────────────────────────────────────
function ExamCard({
  exam,
  studentId,
  onStart,
}: {
  exam: ScheduledExam;
  studentId: string;
  onStart: (id: string) => void;
}) {
  const [status, setStatus] = useState(getExamStatus(exam));
  const [attempted, setAttempted] = useState(false);
  const [checkingAttempt, setCheckingAttempt] = useState(true);

  useEffect(() => {
    hasStudentAttempted(exam.id, studentId)
      .then(setAttempted)
      .finally(() => setCheckingAttempt(false));
  }, [exam.id, studentId]);

  // Poll status every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setStatus(getExamStatus(exam)), 10000);
    return () => clearInterval(interval);
  }, [exam]);

  const startMs = getExamStartMs(exam);
  const endMs = getExamEndMs(exam);

  const statusConfig = {
    upcoming: {
      label: "Upcoming",
      color: "var(--info)",
      bg: "rgba(59,130,246,0.08)",
      border: "rgba(59,130,246,0.2)",
    },
    live: {
      label: "● Live Now",
      color: "var(--success)",
      bg: "rgba(16,185,129,0.08)",
      border: "rgba(16,185,129,0.3)",
    },
    ended: {
      label: "Ended",
      color: "var(--text-muted)",
      bg: "var(--bg-hover)",
      border: "var(--border-subtle)",
    },
  }[status];

  return (
    <div
      className="rounded-2xl p-6 transition-all duration-200"
      style={{
        background: "var(--bg-surface)",
        border: status === "live"
          ? "1px solid rgba(16,185,129,0.3)"
          : "1px solid var(--border-subtle)",
        boxShadow: status === "live" ? "0 0 20px rgba(16,185,129,0.06)" : "none",
      }}
    >
      {/* Status + Title */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <span
            className="text-xs font-medium px-2.5 py-0.5 rounded-full"
            style={{
              color: statusConfig.color,
              background: statusConfig.bg,
            }}
          >
            {statusConfig.label}
          </span>
          <h3
            className="font-bold text-lg mt-2 leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            {exam.title}
          </h3>
        </div>
        {status === "live" && (
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid var(--success)" }}
          >
            <Zap size={18} style={{ color: "var(--success)" }} />
          </div>
        )}
      </div>

      {/* Meta */}
      <div
        className="grid grid-cols-2 gap-3 mb-5 text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        <div className="flex items-center gap-2">
          <Calendar size={13} style={{ color: "var(--text-muted)" }} />
          <span>{new Date(startMs).toLocaleDateString("en-GB", {
            day: "numeric", month: "short", year: "numeric"
          })}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={13} style={{ color: "var(--text-muted)" }} />
          <span>{exam.startTime} · {exam.durationMinutes} min</span>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen size={13} style={{ color: "var(--text-muted)" }} />
          <span>{exam.totalQuestions} Questions</span>
        </div>
        
      </div>

      {/* Countdown (for upcoming) */}
      {status === "upcoming" && (
        <div
          className="mb-4 px-3 py-2 rounded-lg"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <CountdownTimer targetMs={startMs} variant="card" />
        </div>
      )}

      {/* Time remaining (for live) */}
      {status === "live" && (
        <div
          className="mb-4 px-3 py-2 rounded-lg flex items-center justify-between"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}
        >
          <span className="text-xs" style={{ color: "var(--success)" }}>
            Time remaining to complete the exam:
          </span>
          <CountdownTimer targetMs={endMs} variant="card" />
        </div>
      )}

      {/* CTA */}
      {checkingAttempt ? (
        <div className="skeleton h-10 rounded-xl" />
      ) : attempted ? (
        <div
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: "rgba(16,185,129,0.08)",
            color: "var(--success)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <CheckCircle size={15} />
          Already Submitted
        </div>
      ) : status === "upcoming" ? (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
            cursor: "not-allowed",
          }}
        >
          <Lock size={14} />
          Opens at {exam.startTime}
        </button>
      ) : status === "ended" ? (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
            cursor: "not-allowed",
          }}
        >
          <Lock size={14} />
          Exam Ended
        </button>
      ) : (
        <button
          onClick={() => onStart(exam.id)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: "var(--cyan)",
            color: "#000",
          }}
        >
          Start Exam
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Student Portal
// ─────────────────────────────────────────────────────────────────────────────
export default function StudentPortal() {
  const router = useRouter();
  const [session, setSession] = useState<StudentSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [exams, setExams] = useState<ScheduledExam[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "live" | "upcoming" | "ended">("all");

  useEffect(() => {
    const raw = sessionStorage.getItem("student_session");
    if (raw) {
      try {
        setSession(JSON.parse(raw));
      } catch {
        sessionStorage.removeItem("student_session");
      }
    }
    setSessionChecked(true);
  }, []);

  const loadExams = useCallback(async () => {
    setLoading(true);
    const all = await getAllScheduledExams();
    setExams(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) loadExams();
  }, [session, loadExams]);

  const handleLogin = (s: StudentSession) => setSession(s);
  const handleLogout = () => {
    sessionStorage.removeItem("student_session");
    setSession(null);
  };
  const handleStart = (examId: string) => {
    sessionStorage.setItem("exam_student_id", session!.studentId);
    router.push(`/student/exam/${examId}`);
  };

  if (!sessionChecked) return null;
  if (!session) return <StudentLogin onLogin={handleLogin} />;

  const filteredExams =
    filter === "all" ? exams : exams.filter((e) => getExamStatus(e) === filter);

  const liveCount = exams.filter((e) => getExamStatus(e) === "live").length;

  return (
    <div className="min-h-screen grid-pattern">
      {/* Header */}
      <header
        className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
        style={{
          background: "rgba(8,11,18,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--cyan)", flexShrink: 0 }}
          >
            <BookOpen size={16} color="#000" />
          </div>
          <span
            className="font-bold"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            IES
          </span>
          {liveCount > 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: "rgba(16,185,129,0.12)",
                color: "var(--success)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              {liveCount} live
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <User size={14} />
            <span className="font-mono-exam text-xs">{session.studentId}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <LogOut size={13} />
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1
            className="text-4xl font-bold"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            Assalamualikum, {session.name}
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
            Your scheduled examinations are listed below.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 mb-6">
          {(["all", "live", "upcoming", "ended"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-lg text-sm capitalize font-medium transition-all"
              style={{
                background: filter === f ? "var(--cyan-glow)" : "var(--bg-elevated)",
                border: filter === f ? "1px solid var(--cyan)" : "1px solid var(--border-subtle)",
                color: filter === f ? "var(--cyan)" : "var(--text-secondary)",
              }}
            >
              {f}
            </button>
          ))}
          <button
            onClick={loadExams}
            className="ml-auto px-4 py-1.5 rounded-lg text-sm"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            Refresh
          </button>
        </div>

        {/* Exams Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-64 rounded-2xl" />
            ))}
          </div>
        ) : filteredExams.length === 0 ? (
          <div
            className="rounded-2xl p-16 text-center"
            style={{
              background: "var(--bg-surface)",
              border: "1px dashed var(--border-strong)",
            }}
          >
            <Calendar
              size={44}
              className="mx-auto mb-4"
              style={{ color: "var(--text-muted)" }}
            />
            <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
              No {filter !== "all" ? filter : ""} exams found.
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Check back later or contact your administrator.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredExams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                studentId={session.studentId}
                onStart={handleStart}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
