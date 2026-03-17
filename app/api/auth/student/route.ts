import { NextRequest, NextResponse } from "next/server";
import { getStudentAllowlistEntry } from "@/lib/firestore";

/**
 * POST /api/auth/student
 * Body: { studentId: string }
 *
 * Validates a student ID against the Firestore allowlist server-side.
 * Running this in an API route means:
 *  - The Firestore read happens on the server (no CORS issues).
 *  - The client never directly queries the allowlist collection.
 *  - Error messages are generic enough to not leak enumeration info.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawId: string = (body?.studentId ?? "").trim().toUpperCase();

    if (!rawId) {
      return NextResponse.json(
        { error: "Student ID is required." },
        { status: 400 }
      );
    }

    // Validate format to prevent Firestore path injection
    // Accept: letters, digits, hyphens, underscores (1–40 chars)
    if (!/^[A-Z0-9_\-]{1,40}$/.test(rawId)) {
      return NextResponse.json(
        { error: "Invalid Student ID format." },
        { status: 400 }
      );
    }

    const student = await getStudentAllowlistEntry(rawId);

    if (!student) {
      // Don't say "not found" — keep it ambiguous to prevent user enumeration
      return NextResponse.json(
        { error: "Student ID not recognised. Contact your exam administrator." },
        { status: 401 }
      );
    }

    if (!student.isActive) {
      return NextResponse.json(
        { error: "Your access has been suspended. Contact your exam administrator." },
        { status: 403 }
      );
    }

    // Return only the fields the client needs for the session
    return NextResponse.json({
      studentId: student.studentId,
      name: student.name,
      batch: student.batch ?? null,
    });
  } catch (err) {
    console.error("[/api/auth/student]", err);
    return NextResponse.json(
      { error: "Authentication service unavailable. Try again shortly." },
      { status: 500 }
    );
  }
}
