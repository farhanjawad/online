import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import type { RawQuestion, PreparedQuestion, QuestionApiRequest } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Fisher-Yates in-place shuffle — returns a new array, never mutates. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * STRATEGY 1 — "pool"
 *
 * Combine all questions from every set into a single array, shuffle once,
 * then take the first N.
 *
 * Distribution: probabilistic — smaller sets contribute proportionally fewer
 * questions but the exact split is different every time.
 */
function pickFromPool(
  setMap: Map<string, PreparedQuestion[]>,
  totalQuestions: number
): PreparedQuestion[] {
  const all: PreparedQuestion[] = [];
  for (const qs of Array.from(setMap.values())) all.push(...qs);
  return shuffle(all).slice(0, totalQuestions);
}

/**
 * STRATEGY 2 — "interleaved"
 *
 * Each set is shuffled independently first (so every set has a unique random
 * ordering — the same positional index never maps to the same question across
 * sets). Then we round-robin across the sets:
 *
 *   set-A[0], set-B[0], set-C[0], set-A[1], set-B[1], set-C[1], …
 *
 * This guarantees:
 *   • Even representation: each set contributes equally until one runs out.
 *   • No duplicate sequences: independent shuffles mean set-A's question 0
 *     is virtually never the same as set-B's question 0.
 *   • Predictable count: if you have 3 sets and want 30 questions you get
 *     10 from each.  If sets are unequal size, we continue drawing from the
 *     larger sets once the smaller ones are exhausted.
 */
function pickInterleaved(
  setMap: Map<string, PreparedQuestion[]>,
  totalQuestions: number
): PreparedQuestion[] {
  // Shuffle each set independently — this is the key step that prevents
  // the same sequence (same positional ordering) appearing across sets.
  const pools: PreparedQuestion[][] = Array.from(setMap.values()).map(shuffle);
  const cursors = new Array(pools.length).fill(0);
  const result: PreparedQuestion[] = [];

  while (result.length < totalQuestions) {
    let anyAdded = false;
    for (let i = 0; i < pools.length && result.length < totalQuestions; i++) {
      if (cursors[i] < pools[i].length) {
        result.push(pools[i][cursors[i]++]);
        anyAdded = true;
      }
    }
    // All sets exhausted before we reached totalQuestions — stop gracefully.
    if (!anyAdded) break;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML normalisation for answer matching
// ─────────────────────────────────────────────────────────────────────────────

function normaliseHtml(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON loader
// ─────────────────────────────────────────────────────────────────────────────

function loadQuestionSet(source: string): RawQuestion[] {
  const safeName = source.replace(/[^a-zA-Z0-9_\-]/g, "");
  const filePath = path.join(process.cwd(), "data", `${safeName}.json`);

  if (!existsSync(filePath)) {
    console.warn(`[questions API] Set not found: ${filePath}`);
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (Array.isArray(parsed))           return parsed as RawQuestion[];
    if (Array.isArray(parsed.questions)) return parsed.questions as RawQuestion[];
    if (Array.isArray(parsed.data))      return parsed.data as RawQuestion[];
    return [];
  } catch (err) {
    console.error(`[questions API] Failed to parse ${filePath}:`, err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: QuestionApiRequest = await request.json();
    const { sources, totalQuestions, strategy = "pool" } = body;

    if (!sources?.length || !totalQuestions || totalQuestions < 1) {
      return NextResponse.json(
        { error: "Invalid request: sources and totalQuestions are required." },
        { status: 400 }
      );
    }

    // ── Load and enrich each set ─────────────────────────────────────────────
    // Use a Map so we preserve insertion order (= the order the admin selected
    // the sets) for the interleaved strategy.
    const setMap = new Map<string, PreparedQuestion[]>();

    for (const source of sources) {
      const rawQuestions = loadQuestionSet(source);
      const enriched: PreparedQuestion[] = [];

      for (let rawIdx = 0; rawIdx < rawQuestions.length; rawIdx++) {
        const q = rawQuestions[rawIdx];
        const normCorrect = normaliseHtml(q.correct_answer_html);

        let correctIndex = q.options_html.findIndex(
          (opt) => normaliseHtml(opt) === normCorrect
        );

        // Fallback: substring containment (handles extra wrapper tags)
        if (correctIndex === -1 && normCorrect.length > 0) {
          correctIndex = q.options_html.findIndex(
            (opt) =>
              normaliseHtml(opt).includes(normCorrect) ||
              normCorrect.includes(normaliseHtml(opt))
          );
        }

        if (correctIndex === -1) {
          console.warn(
            `[questions API] No answer match — source "${source}" q${rawIdx}\n` +
              `  correct: "${normCorrect}"\n` +
              `  options: ${q.options_html.map(normaliseHtml).join(" | ")}`
          );
          continue;
        }

        enriched.push({
          ...q,
          correctIndex,
          examSource: source,
          _key: `${source}__${rawIdx}`,
        });
      }

      if (enriched.length > 0) setMap.set(source, enriched);
    }

    if (setMap.size === 0) {
      return NextResponse.json(
        { error: "No valid questions found in the selected sources." },
        { status: 404 }
      );
    }

    // ── Apply the chosen randomization strategy ──────────────────────────────
    const selected =
      strategy === "interleaved"
        ? pickInterleaved(setMap, totalQuestions)
        : pickFromPool(setMap, totalQuestions);

    if (selected.length === 0) {
      return NextResponse.json(
        { error: "Randomization produced zero questions. Check set sizes vs totalQuestions." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      questions: selected,
      meta: {
        strategy,
        requested: totalQuestions,
        served: selected.length,
        setsUsed: Array.from(setMap.keys()),
        questionsPerSet: Object.fromEntries(
          Array.from(setMap.entries()).map(([k, v]) => [k, v.length])
        ),
      },
    });
  } catch (err) {
    console.error("[questions API] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
