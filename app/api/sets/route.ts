import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "fs";
import path from "path";
import type { SetInfo, SubjectGroup, SetsApiResponse } from "@/lib/types";

/**
 * Parses a JSON filename (without extension) into structured metadata.
 *
 * Supported patterns:
 *   biology_set_1      → subject: "biology",  label: "Set 1"
 *   biology_set1       → subject: "biology",  label: "Set 1"
 *   math_set_4         → subject: "math",     label: "Set 4"
 *   physics_set_12     → subject: "physics",  label: "Set 12"
 *   set-1  / set_1     → subject: "general",  label: "Set 1"  (legacy)
 *   anything_else      → subject: "other",    label: filename
 */
function parseFilename(filename: string): SetInfo {
  // Strip .json extension
  const name = filename.replace(/\.json$/i, "");

  // Pattern: {subject}_set_{n} or {subject}_set{n}
  const subjectSetMatch = name.match(/^(.+?)_set_?(\d+)$/i);
  if (subjectSetMatch) {
    const rawSubject = subjectSetMatch[1].toLowerCase();
    const setNumber = parseInt(subjectSetMatch[2], 10);
    // Convert underscores to spaces for display
    const subjectLabel =
      rawSubject
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      value: name,
      label: `Set ${setNumber}`,
      subject: rawSubject,
      subjectLabel,
      setNumber,
    };
  }

  // Legacy pattern: set-{n} or set_{n}
  const legacyMatch = name.match(/^set[-_](\d+)$/i);
  if (legacyMatch) {
    return {
      value: name,
      label: `Set ${legacyMatch[1]}`,
      subject: "general",
      subjectLabel: "General",
      setNumber: parseInt(legacyMatch[1], 10),
    };
  }

  // Fallback — unknown naming convention; still include so admins can see it
  return {
    value: name,
    label: name,
    subject: "other",
    subjectLabel: "Other",
    setNumber: 0,
  };
}

export async function GET() {
  const dataDir = path.join(process.cwd(), "data");

  if (!existsSync(dataDir)) {
    return NextResponse.json<SetsApiResponse>({ groups: {}, total: 0 });
  }

  let files: string[];
  try {
    files = readdirSync(dataDir).filter((f) =>
      f.endsWith(".json") && !f.startsWith("_")
    );
  } catch {
    return NextResponse.json({ error: "Could not read /data directory." }, { status: 500 });
  }

  const groups: Record<string, SubjectGroup> = {};

  for (const file of files) {
    const info = parseFilename(file);
    if (!groups[info.subject]) {
      groups[info.subject] = { label: info.subjectLabel, sets: [] };
    }
    groups[info.subject].sets.push(info);
  }

  // Sort sets within each subject by set number, then alphabetically
  for (const subject of Object.keys(groups)) {
    groups[subject].sets.sort((a, b) =>
      a.setNumber !== b.setNumber
        ? a.setNumber - b.setNumber
        : a.value.localeCompare(b.value)
    );
  }

  // Sort subjects alphabetically, but put "general" first and "other" last
  const sortedGroups: Record<string, SubjectGroup> = {};
  const subjectKeys = Object.keys(groups).sort((a, b) => {
    if (a === "general") return -1;
    if (b === "general") return 1;
    if (a === "other") return 1;
    if (b === "other") return -1;
    return a.localeCompare(b);
  });
  for (const key of subjectKeys) {
    sortedGroups[key] = groups[key];
  }

  return NextResponse.json<SetsApiResponse>({
    groups: sortedGroups,
    total: files.length,
  });
}
