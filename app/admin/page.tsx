"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  createScheduledExam,
  getAllScheduledExams,
  deleteScheduledExam,
  getResultsForExam,
  getAllStudents,
  upsertStudent,
  bulkUpsertStudents,
  setStudentActive,
  deleteStudent,
} from "@/lib/firestore";
import type {
  ScheduledExam,
  ExamResult,
  CreateExamPayload,
  StudentAllowlistEntry,
  CreateStudentPayload,
} from "@/lib/types";
import { getExamStatus, getExamStartMs } from "@/lib/types";
import SetSelector from "@/components/SetSelector";
import {
  BookOpen, Plus, Trash2, Users, Clock, Calendar,
  ChevronRight, CheckCircle, AlertCircle, LogOut,
  BarChart3, Database, Layers, Shield, Search,
  UserPlus, Upload, ToggleLeft, ToggleRight, X,
  RefreshCw, Download,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string;
}) {
  return (
    <div className="rounded-xl p-5 flex items-center gap-4"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${accent}18`, border: `1px solid ${accent}` }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "upcoming" | "live" | "ended" }) {
  const cfg = {
    upcoming: { color: "var(--info)", bg: "rgba(59,130,246,0.1)", label: "Upcoming" },
    live:     { color: "var(--success)", bg: "rgba(16,185,129,0.1)", label: "● Live" },
    ended:    { color: "var(--text-muted)", bg: "var(--bg-hover)", label: "Ended" },
  }[status];
  return (
    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types / defaults
// ─────────────────────────────────────────────────────────────────────────────
type Tab = "dashboard" | "schedule" | "students" | "results";

const DEFAULT_FORM: CreateExamPayload = {
  title: "", date: new Date().toISOString().split("T")[0],
  startTime: "09:00", durationMinutes: 55,
  examSources: [], totalQuestions: 50, negativeMarking: 0, strategy: "pool" as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── STUDENTS TAB ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function StudentsTab({ adminUid }: { adminUid: string }) {
  const [students, setStudents] = useState<StudentAllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Single-add form
  const [singleId, setSingleId]     = useState("");
  const [singleName, setSingleName] = useState("");
  const [singleBatch, setSingleBatch] = useState("");
  const [addingOne, setAddingOne]   = useState(false);
  const [addOneStatus, setAddOneStatus] = useState<"idle"|"ok"|"err">("idle");

  // Bulk import
  const [bulkText, setBulkText]       = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult]   = useState<{added:number; skipped:number} | null>(null);
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    getAllStudents().then(setStudents).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddOne = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleId.trim()) return;
    setAddingOne(true);
    try {
      const payload: CreateStudentPayload = {
        studentId: singleId.trim().toUpperCase(),
        name: singleName.trim() || singleId.trim().toUpperCase(),
        batch: singleBatch.trim() || undefined,
        isActive: true,
      };
      await upsertStudent(payload, adminUid);
      setSingleId(""); setSingleName(""); setSingleBatch("");
      setAddOneStatus("ok");
      await load();
      setTimeout(() => setAddOneStatus("idle"), 2000);
    } catch { setAddOneStatus("err"); }
    finally { setAddingOne(false); }
  };

  /**
   * Bulk import parser:
   * Each line can be:
   *   STD001
   *   STD001, John Doe
   *   STD001, John Doe, Batch A
   * OR comma-separated on one line (treated as IDs only):
   *   STD001,STD002,STD003
   */
  const parseBulkText = (text: string): CreateStudentPayload[] => {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const entries: CreateStudentPayload[] = [];

    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;

      // If first part looks like multiple IDs (no spaces, short), treat as multi-ID line
      if (parts.length > 1 && parts.every(p => p.length <= 20 && /^[A-Za-z0-9_\-]+$/.test(p))) {
        // Could be "STD001, STD002, STD003" (all IDs) or "STD001, John Doe, Batch A"
        // Heuristic: if all parts match an ID pattern, treat as multiple IDs
        const allLookLikeIds = parts.every(p => /^[A-Za-z0-9_\-]{1,20}$/.test(p) && !/\s/.test(p));
        if (allLookLikeIds && parts.length >= 3) {
          // Multiple IDs on one line
          for (const id of parts) {
            entries.push({ studentId: id.toUpperCase(), name: id.toUpperCase(), isActive: true });
          }
          continue;
        }
      }

      const [id, name, batch] = parts;
      if (!id) continue;
      entries.push({
        studentId: id.toUpperCase(),
        name: name || id.toUpperCase(),
        batch: batch || undefined,
        isActive: true,
      });
    }
    return entries;
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setBulkImporting(true);
    setBulkResult(null);
    try {
      const entries = parseBulkText(bulkText);
      if (entries.length === 0) {
        setBulkResult({ added: 0, skipped: 0 });
        return;
      }
      const result = await bulkUpsertStudents(entries, adminUid);
      setBulkResult(result);
      setBulkText("");
      await load();
    } catch { setBulkResult({ added: 0, skipped: -1 }); }
    finally { setBulkImporting(false); }
  };

  const handleToggle = async (studentId: string, current: boolean) => {
    await setStudentActive(studentId, !current);
    setStudents(prev => prev.map(s => s.studentId === studentId ? { ...s, isActive: !current } : s));
  };

  const handleDelete = async (studentId: string) => {
    if (!confirm(`Remove ${studentId} from the allowlist?`)) return;
    await deleteStudent(studentId);
    setStudents(prev => prev.filter(s => s.studentId !== studentId));
  };

  /** Export to CSV */
  const handleExport = () => {
    const rows = ["Student ID,Name,Batch,Active,Added At"];
    for (const s of students) {
      rows.push(`${s.studentId},"${s.name}","${s.batch ?? ""}",${s.isActive},${new Date(s.addedAt).toISOString()}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "students.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = students.filter(s =>
    !searchTerm ||
    s.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.batch ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = students.filter(s => s.isActive).length;

  const inputStyle = {
    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)", borderRadius: 12, padding: "10px 14px",
    fontSize: 13, outline: "none", width: "100%",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            Student Allowlist
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Only students on this list can log in and take exams.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Users size={17}/>} label="Total Students" value={students.length} accent="var(--accent)"/>
        <StatCard icon={<CheckCircle size={17}/>} label="Active" value={activeCount} accent="var(--success)"/>
        <StatCard icon={<Shield size={17}/>} label="Suspended" value={students.length - activeCount} accent="var(--danger)"/>
      </div>

      {/* ── Add single student ──────────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <UserPlus size={15} style={{ color: "var(--accent)" }} />
          Add / Update Student
        </h3>
        <form onSubmit={handleAddOne} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-32">
            <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-muted)" }}>Student ID *</label>
            <input value={singleId} onChange={e => setSingleId(e.target.value)}
              placeholder="STD-2025-001" required
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-glow)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border-subtle)"; e.target.style.boxShadow = "none"; }}
            />
          </div>
          <div className="flex-1 min-w-36">
            <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-muted)" }}>Full Name</label>
            <input value={singleName} onChange={e => setSingleName(e.target.value)}
              placeholder="Karim Hassan"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border-subtle)"; }}
            />
          </div>
          <div className="flex-1 min-w-28">
            <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-muted)" }}>Batch</label>
            <input value={singleBatch} onChange={e => setSingleBatch(e.target.value)}
              placeholder="2024-25 Batch A"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border-subtle)"; }}
            />
          </div>
          <button type="submit" disabled={addingOne}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
            style={{ background: "var(--accent)", color: "#000", opacity: addingOne ? 0.7 : 1 }}>
            {addingOne ? "Adding…" : "Add"}
          </button>
        </form>
        {addOneStatus === "ok" && (
          <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--success)" }}>
            <CheckCircle size={12}/> Student added successfully.
          </p>
        )}
        {addOneStatus === "err" && (
          <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--danger)" }}>
            <AlertCircle size={12}/> Failed to add student.
          </p>
        )}
      </div>

      {/* ── Bulk Import ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <button type="button" onClick={() => setShowBulkPanel(p => !p)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}>
          <span className="flex items-center gap-2">
            <Upload size={15} style={{ color: "var(--accent)" }}/>
            Bulk Import
            <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
              — paste IDs, CSV, or spreadsheet rows
            </span>
          </span>
          <ChevronRight size={15} style={{ color: "var(--text-muted)", transform: showBulkPanel ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}/>
        </button>

        {showBulkPanel && (
          <div className="px-5 pb-5 space-y-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <p className="text-xs pt-3" style={{ color: "var(--text-muted)" }}>
              Each line: <code style={{ color: "var(--accent)" }}>STD001</code>&nbsp; or &nbsp;
              <code style={{ color: "var(--accent)" }}>STD001, Full Name</code>&nbsp; or &nbsp;
              <code style={{ color: "var(--accent)" }}>STD001, Full Name, Batch A</code><br />
              Existing IDs are updated (not duplicated). Max 400 per paste.
            </p>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={8}
              placeholder={"STD-2025-001, Karim Hassan, Batch A\nSTD-2025-002, Fatima Rahman\nSTD-2025-003"}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono-exam resize-y"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
              onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border-subtle)"; }}
            />
            <div className="flex items-center gap-3">
              <button onClick={handleBulkImport} disabled={bulkImporting || !bulkText.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: bulkImporting ? "var(--accent-dim)" : "var(--accent)", color: "#000", opacity: (!bulkText.trim() || bulkImporting) ? 0.6 : 1 }}>
                {bulkImporting ? "Importing…" : `Import ${parseBulkTextPreview(bulkText)} students`}
              </button>
              {bulkResult && (
                <p className="text-sm" style={{ color: bulkResult.skipped === -1 ? "var(--danger)" : "var(--success)" }}>
                  {bulkResult.skipped === -1
                    ? "Import failed."
                    : `✓ ${bulkResult.added} added/updated`
                  }
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Student Table ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }}/>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by ID, name, or batch…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
              onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border-subtle)"; }}
            />
          </div>
          {searchTerm && (
            <p className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
              {filtered.length} / {students.length}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-xl"/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-strong)" }}>
            <Users size={36} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }}/>
            <p style={{ color: "var(--text-secondary)" }}>
              {searchTerm ? `No students match "${searchTerm}"` : "No students yet. Add some above."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {["Student ID", "Name", "Batch", "Status", "Added", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={s.studentId}
                      style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                      <td className="px-4 py-3 font-mono-exam font-semibold" style={{ color: "var(--text-primary)" }}>
                        {s.studentId}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{s.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{s.batch ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: s.isActive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)",
                            color: s.isActive ? "var(--success)" : "var(--danger)",
                          }}>
                          {s.isActive ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono-exam" style={{ color: "var(--text-muted)" }}>
                        {new Date(s.addedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => handleToggle(s.studentId, s.isActive)} title={s.isActive ? "Suspend" : "Activate"}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                            style={{
                              background: s.isActive ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                              color: s.isActive ? "var(--danger)" : "var(--success)",
                              border: `1px solid ${s.isActive ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}`,
                            }}>
                            {s.isActive ? <ToggleLeft size={13}/> : <ToggleRight size={13}/>}
                            {s.isActive ? "Suspend" : "Activate"}
                          </button>
                          <button onClick={() => handleDelete(s.studentId)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: "rgba(239,68,68,0.08)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.15)" }}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small helper used only for the bulk import button label */
function parseBulkTextPreview(text: string): number {
  return text.split(/\n/).map(l => l.trim()).filter(Boolean).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── MAIN ADMIN DASHBOARD ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const [exams, setExams] = useState<ScheduledExam[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);

  const [form, setForm] = useState<CreateExamPayload>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle"|"success"|"error">("idle");

  const [selectedExamForResults, setSelectedExamForResults] = useState<string | null>(null);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) router.replace("/admin/login");
    });
    return unsub;
  }, [router]);

  // ── Load exams ──────────────────────────────────────────────────────────
  const loadExams = useCallback(async () => {
    setExamsLoading(true);
    getAllScheduledExams().then(setExams).finally(() => setExamsLoading(false));
  }, []);

  useEffect(() => { if (user) loadExams(); }, [user, loadExams]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.examSources.length === 0) { alert("Select at least one question set."); return; }
    setSubmitting(true); setSubmitStatus("idle");
    try {
      await createScheduledExam(form, user!.uid);
      await loadExams();
      setForm(DEFAULT_FORM);
      setSubmitStatus("success");
      setTimeout(() => { setSubmitStatus("idle"); setActiveTab("dashboard"); }, 1500);
    } catch { setSubmitStatus("error"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this exam? This cannot be undone.")) return;
    await deleteScheduledExam(id);
    setExams(prev => prev.filter(e => e.id !== id));
  };

  const handleViewResults = async (examId: string) => {
    setSelectedExamForResults(examId);
    setActiveTab("results");
    setResultsLoading(true);
    const results = await getResultsForExam(examId);
    setExamResults(results);
    setResultsLoading(false);
  };

  const inputStyle = (focused: boolean = false) => ({
    background: "var(--bg-elevated)",
    border: `1px solid ${focused ? "var(--accent)" : "var(--border-subtle)"}`,
    color: "var(--text-primary)", borderRadius: 12,
    padding: "10px 14px", fontSize: 13, outline: "none", width: "100%",
  });

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = "var(--accent)";
    e.target.style.boxShadow = "0 0 0 3px var(--accent-glow)";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = "var(--border-subtle)";
    e.target.style.boxShadow = "none";
  };

  // ── Loading spinner ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}/>
      </div>
    );
  }
  if (!user) return null;

  const liveCount     = exams.filter(e => getExamStatus(e) === "live").length;
  const upcomingCount = exams.filter(e => getExamStatus(e) === "upcoming").length;

  const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard",     icon: <BarChart3 size={16}/> },
    { id: "schedule",  label: "Schedule Exam", icon: <Plus size={16}/> },
    { id: "students",  label: "Students",      icon: <Users size={16}/> },
    { id: "results",   label: "Results",       icon: <Database size={16}/> },
  ];

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col h-screen sticky top-0"
        style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border-subtle)" }}>
        <div className="p-6 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--accent)" }}>
              <BookOpen size={16} color="#000"/>
            </div>
            <div>
              <p className="font-bold text-sm leading-none" style={{ color: "var(--text-primary)" }}>ExamPortal</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Admin Console</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeTab === item.id ? "var(--accent-glow)" : "transparent",
                color: activeTab === item.id ? "var(--accent)" : "var(--text-secondary)",
                border: activeTab === item.id ? "1px solid var(--accent)" : "1px solid transparent",
              }}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--accent)", color: "#000" }}>
              {user.email?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{user.email}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Administrator</p>
            </div>
          </div>
          <button onClick={() => signOut(auth).then(() => router.push("/"))}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}>
            <LogOut size={13}/> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-8">

        {/* ══ DASHBOARD ══════════════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>Dashboard</h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Overview of all scheduled exams</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard icon={<Database size={18}/>} label="Total Exams"  value={exams.length}  accent="var(--accent)"/>
              <StatCard icon={<CheckCircle size={18}/>} label="Live Now"  value={liveCount}     accent="var(--success)"/>
              <StatCard icon={<Calendar size={18}/>} label="Upcoming"     value={upcomingCount} accent="var(--info)"/>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>All Exams</h2>
                <button onClick={() => setActiveTab("schedule")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--accent)", color: "#000" }}>
                  <Plus size={15}/> New Exam
                </button>
              </div>

              {examsLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="skeleton h-16 rounded-xl"/>)}</div>
              ) : exams.length === 0 ? (
                <div className="rounded-2xl p-12 text-center" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-strong)" }}>
                  <Calendar size={40} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }}/>
                  <p style={{ color: "var(--text-secondary)" }}>No exams scheduled yet.</p>
                  <button onClick={() => setActiveTab("schedule")} className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "var(--accent)", color: "#000" }}>
                    Schedule Your First Exam
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {exams.map(exam => {
                    const status = getExamStatus(exam);
                    const startDate = new Date(getExamStartMs(exam));
                    return (
                      <div key={exam.id} className="rounded-xl px-5 py-4 flex items-center gap-4"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>{exam.title}</p>
                            <StatusBadge status={status}/>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-mono-exam" style={{ color: "var(--text-muted)" }}>
                            <span className="flex items-center gap-1"><Calendar size={11}/>{startDate.toLocaleDateString()}</span>
                            <span className="flex items-center gap-1"><Clock size={11}/>{exam.startTime} · {exam.durationMinutes}m</span>
                            <span className="flex items-center gap-1"><Layers size={11}/>{exam.totalQuestions}Q · [{exam.examSources.join(", ")}]</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => handleViewResults(exam.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                            <BarChart3 size={13}/> Results
                          </button>
                          <button onClick={() => handleDelete(exam.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: "rgba(239,68,68,0.08)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SCHEDULE EXAM ══════════════════════════════════════════════ */}
        {activeTab === "schedule" && (
          <div className="max-w-2xl">
            <div className="mb-8">
              <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>Schedule New Exam</h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Configure randomization rules and timing</p>
            </div>

            <form onSubmit={handleCreateExam} className="space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Exam Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Biology Chapter 5 MCQ" required
                  style={inputStyle()} onFocus={handleFocus} onBlur={handleBlur}/>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Exam Date *</label>
                  <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    required style={inputStyle()} onFocus={handleFocus} onBlur={handleBlur}/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Start Time *</label>
                  <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                    required style={inputStyle()} onFocus={handleFocus} onBlur={handleBlur}/>
                </div>
              </div>

              {/* Duration & Questions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Duration (minutes) *</label>
                  <input type="number" value={form.durationMinutes}
                    onChange={e => setForm(p => ({ ...p, durationMinutes: Number(e.target.value) }))}
                    min={5} max={300} required style={inputStyle()} onFocus={handleFocus} onBlur={handleBlur}/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Total Questions *</label>
                  <input type="number" value={form.totalQuestions}
                    onChange={e => setForm(p => ({ ...p, totalQuestions: Number(e.target.value) }))}
                    min={1} max={500} required style={inputStyle()} onFocus={handleFocus} onBlur={handleBlur}/>
                </div>
              </div>

              {/* Negative Marking */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Negative Marking
                </label>
                <select value={form.negativeMarking}
                  onChange={e => setForm(p => ({ ...p, negativeMarking: Number(e.target.value) }))}
                  style={{ ...inputStyle(), padding: "10px 14px" }} onFocus={handleFocus} onBlur={handleBlur}>
                  <option value={0}>0 — No penalty</option>
                  <option value={0.25}>0.25 — ¼ mark per wrong</option>
                  <option value={0.5}>0.5 — ½ mark per wrong</option>
                  <option value={1}>1 — Full mark per wrong</option>
                </select>
              </div>

              {/* Randomization Strategy */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                  Randomization Strategy
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    {
                      value: "pool" as const,
                      title: "Pool (default)",
                      desc: "Mix all sets together, shuffle once, pick N. Distribution is random.",
                    },
                    {
                      value: "interleaved" as const,
                      title: "Interleaved",
                      desc: "Round-robin: 1 from Set-A, 1 from Set-B, 1 from Set-C… Each set is shuffled independently so no two sets share the same sequence.",
                    },
                  ]).map((opt) => {
                    const active = form.strategy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, strategy: opt.value }))}
                        className="text-left rounded-xl p-4 transition-all"
                        style={{
                          background: active ? "var(--accent-glow)" : "var(--bg-elevated)",
                          border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
                        }}
                      >
                        <p className="text-sm font-semibold mb-1"
                          style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>
                          {active ? "✓ " : ""}{opt.title}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Set Selector */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Question Sets *
                </label>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Select which sets to randomly draw <strong style={{ color: "var(--accent)" }}>{form.totalQuestions}</strong> questions from.
                  Sets are loaded from your <code style={{ color: "var(--accent)" }}>/data</code> directory.
                </p>
                <SetSelector
                  selected={form.examSources}
                  onChange={(sources) => setForm(p => ({ ...p, examSources: sources }))}
                />
              </div>

              {/* Status messages */}
              {submitStatus === "success" && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                  style={{ background: "rgba(16,185,129,0.08)", border: "1px solid var(--success)", color: "var(--success)" }}>
                  <CheckCircle size={15}/> Exam scheduled! Redirecting to dashboard…
                </div>
              )}
              {submitStatus === "error" && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
                  <AlertCircle size={15}/> Failed to schedule. Try again.
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" disabled={submitting}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm"
                  style={{ background: submitting ? "var(--accent-dim)" : "var(--accent)", color: "#000", opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? "Scheduling…" : "Schedule Exam"}
                </button>
                <button type="button" onClick={() => { setForm(DEFAULT_FORM); setActiveTab("dashboard"); }}
                  className="px-6 py-3 rounded-xl text-sm font-medium"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══ STUDENTS ════════════════════════════════════════════════════ */}
        {activeTab === "students" && <StudentsTab adminUid={user.uid}/>}

        {/* ══ RESULTS ════════════════════════════════════════════════════ */}
        {activeTab === "results" && (
          <div>
            <div className="flex items-center gap-3 mb-8">
              {selectedExamForResults && (
                <button onClick={() => { setSelectedExamForResults(null); setExamResults([]); }}
                  style={{ color: "var(--text-muted)" }}>← Back</button>
              )}
              <div>
                <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
                  Exam Results
                </h1>
                {selectedExamForResults && (
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    {exams.find(e => e.id === selectedExamForResults)?.title}
                  </p>
                )}
              </div>
            </div>

            {!selectedExamForResults && (
              <div className="space-y-2">
                {exams.map(exam => (
                  <button key={exam.id} onClick={() => handleViewResults(exam.id)}
                    className="w-full flex items-center justify-between px-5 py-4 rounded-xl text-left"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                    <div>
                      <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{exam.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{exam.date} · {exam.startTime}</p>
                    </div>
                    <ChevronRight size={16} style={{ color: "var(--text-muted)" }}/>
                  </button>
                ))}
              </div>
            )}

            {selectedExamForResults && (
              resultsLoading ? (
                <div className="space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
              ) : examResults.length === 0 ? (
                <div className="rounded-2xl p-12 text-center" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-strong)" }}>
                  <Users size={36} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }}/>
                  <p style={{ color: "var(--text-secondary)" }}>No submissions yet.</p>
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        {["Student ID","Score","Correct","Wrong","Skipped","Time","Submitted"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: "var(--text-muted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {examResults.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: i < examResults.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                          <td className="px-4 py-3 font-mono-exam font-medium" style={{ color: "var(--text-primary)" }}>{r.studentId}</td>
                          <td className="px-4 py-3 font-bold" style={{ color: "var(--accent)" }}>{r.score.toFixed(2)}/{r.totalQuestions}</td>
                          <td className="px-4 py-3" style={{ color: "var(--success)" }}>{r.correct}</td>
                          <td className="px-4 py-3" style={{ color: "var(--danger)" }}>{r.wrong}</td>
                          <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{r.totalQuestions - r.attempted}</td>
                          <td className="px-4 py-3 font-mono-exam text-xs" style={{ color: "var(--text-secondary)" }}>
                            {Math.floor(r.timeTakenSeconds/60)}m {r.timeTakenSeconds%60}s
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                            {new Date(r.submittedAt).toLocaleString()}
                            {r.submissionType === "auto" && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>Auto</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}

      </main>
    </div>
  );
}
