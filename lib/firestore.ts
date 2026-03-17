import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  query,
  orderBy,
  where,
  deleteDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  ScheduledExam,
  ExamResult,
  CreateExamPayload,
  StudentAllowlistEntry,
  CreateStudentPayload,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic document ID helpers
// ─────────────────────────────────────────────────────────────────────────────

/** exam_results doc ID: no composite index + idempotent resubmit guard */
function resultDocId(examId: string, studentId: string): string {
  return `${examId}__${studentId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection refs
// ─────────────────────────────────────────────────────────────────────────────
const examsCol      = collection(db, "scheduled_exams");
const resultsCol    = collection(db, "exam_results");
const allowlistCol  = collection(db, "student_allowlist");

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled Exams
// ─────────────────────────────────────────────────────────────────────────────
export async function createScheduledExam(
  payload: CreateExamPayload,
  adminUid: string
): Promise<string> {
  const ref = await addDoc(examsCol, {
    ...payload,
    createdBy: adminUid,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function getAllScheduledExams(): Promise<ScheduledExam[]> {
  const snap = await getDocs(query(examsCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScheduledExam));
}

export async function getScheduledExam(id: string): Promise<ScheduledExam | null> {
  const snap = await getDoc(doc(db, "scheduled_exams", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ScheduledExam;
}

export async function deleteScheduledExam(id: string): Promise<void> {
  await deleteDoc(doc(db, "scheduled_exams", id));
}

export async function updateScheduledExam(
  id: string,
  data: Partial<CreateExamPayload>
): Promise<void> {
  await updateDoc(doc(db, "scheduled_exams", id), data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam Results
// ─────────────────────────────────────────────────────────────────────────────
export async function saveExamResult(result: Omit<ExamResult, "id">): Promise<string> {
  const docId = resultDocId(result.examId, result.studentId);
  await setDoc(doc(db, "exam_results", docId), result);
  return docId;
}

export async function getResultsForExam(examId: string): Promise<ExamResult[]> {
  const snap = await getDocs(
    query(resultsCol, where("examId", "==", examId), orderBy("submittedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamResult));
}

export async function getResultsForStudent(studentId: string): Promise<ExamResult[]> {
  const snap = await getDocs(
    query(resultsCol, where("studentId", "==", studentId), orderBy("submittedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamResult));
}

/** Direct getDoc — no query, no composite index. */
export async function hasStudentAttempted(
  examId: string,
  studentId: string
): Promise<boolean> {
  const snap = await getDoc(doc(db, "exam_results", resultDocId(examId, studentId)));
  return snap.exists();
}

// ─────────────────────────────────────────────────────────────────────────────
// Student Allowlist
// Doc ID = studentId (uppercase) so lookup is always a single getDoc()
// ─────────────────────────────────────────────────────────────────────────────

/** Used by the server-side API route to validate student login. */
export async function getStudentAllowlistEntry(
  studentId: string
): Promise<StudentAllowlistEntry | null> {
  const snap = await getDoc(doc(db, "student_allowlist", studentId.toUpperCase()));
  if (!snap.exists()) return null;
  return snap.data() as StudentAllowlistEntry;
}

/** Admin: list all students ordered by studentId */
export async function getAllStudents(): Promise<StudentAllowlistEntry[]> {
  const snap = await getDocs(query(allowlistCol, orderBy("addedAt", "desc")));
  return snap.docs.map((d) => d.data() as StudentAllowlistEntry);
}

/** Admin: add or overwrite a single student */
export async function upsertStudent(
  payload: CreateStudentPayload,
  adminUid: string
): Promise<void> {
  const docId = payload.studentId.toUpperCase();
  await setDoc(doc(db, "student_allowlist", docId), {
    ...payload,
    studentId: docId,
    addedAt: Date.now(),
    addedBy: adminUid,
  });
}

/**
 * Admin: bulk upsert — uses batched writes (max 500 per batch).
 * Returns counts: { added, skipped }
 */
export async function bulkUpsertStudents(
  entries: CreateStudentPayload[],
  adminUid: string
): Promise<{ added: number; skipped: number }> {
  const BATCH_SIZE = 400;
  let added = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const entry of chunk) {
      const id = entry.studentId.trim().toUpperCase();
      if (!id) { skipped++; continue; }
      const ref = doc(db, "student_allowlist", id);
      batch.set(ref, {
        ...entry,
        studentId: id,
        addedAt: Date.now(),
        addedBy: adminUid,
        isActive: entry.isActive ?? true,
      });
      added++;
    }
    await batch.commit();
  }

  return { added, skipped };
}

/** Admin: toggle active/inactive */
export async function setStudentActive(
  studentId: string,
  isActive: boolean
): Promise<void> {
  await updateDoc(doc(db, "student_allowlist", studentId.toUpperCase()), { isActive });
}

/** Admin: delete a student from the allowlist */
export async function deleteStudent(studentId: string): Promise<void> {
  await deleteDoc(doc(db, "student_allowlist", studentId.toUpperCase()));
}
