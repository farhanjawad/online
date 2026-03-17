"use client";

import MathJaxRenderer from "./MathJaxRenderer";
import type { PreparedQuestion } from "@/lib/types";

interface QuestionCardProps {
  question: PreparedQuestion;
  questionNumber: number;
  selectedIndex: number | null; // null = unanswered
  onSelect: (optionIndex: number) => void;
  isSubmitted: boolean; // lock after exam submission
}

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export default function QuestionCard({
  question,
  questionNumber,
  selectedIndex,
  onSelect,
  isSubmitted,
}: QuestionCardProps) {
  const getOptionClass = (idx: number): string => {
    const base = "option-btn w-full text-left rounded-xl px-4 py-3 border transition-all";

    if (!isSubmitted) {
      if (selectedIndex === idx) return `${base} option-selected`;
      return `${base}`;
    }

    // After submission — reveal correct/wrong
    if (idx === question.correctIndex) return `${base} option-correct`;
    if (selectedIndex === idx && idx !== question.correctIndex)
      return `${base} option-wrong`;
    return base;
  };

  const getOptionStyle = (idx: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-subtle)",
    };

    if (!isSubmitted && selectedIndex === idx) {
      return {
        background: "var(--cyan-glow)",
        border: "1px solid var(--cyan)",
      };
    }
    if (isSubmitted && idx === question.correctIndex) {
      return {
        background: "rgba(16,185,129,0.08)",
        border: "1px solid var(--success)",
      };
    }
    if (isSubmitted && selectedIndex === idx && idx !== question.correctIndex) {
      return {
        background: "rgba(239,68,68,0.08)",
        border: "1px solid var(--danger)",
      };
    }
    return base;
  };

  return (
    <div
      className="rounded-2xl p-6 fade-in-up"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Question Header */}
      <div className="flex items-start gap-4 mb-5">
        <span
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono-exam"
          style={{
            background: "var(--accent-glow)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
          }}
        >
          {questionNumber}
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <MathJaxRenderer
            html={question.question_html}
            className="text-base leading-relaxed"
          />
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2.5 pl-0 md:pl-12">
        {question.options_html.map((optHtml, idx) => (
          <button
            key={idx}
            disabled={selectedIndex !== null || isSubmitted}
            onClick={() => {
              if (selectedIndex === null && !isSubmitted) {
                onSelect(idx);
              }
            }}
            className={getOptionClass(idx)}
            style={getOptionStyle(idx)}
          >
            <div className="flex items-start gap-3">
              {/* Option Label */}
              <span
                className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold font-mono-exam mt-0.5"
                style={{
                  background:
                    !isSubmitted && selectedIndex === idx
                      ? "var(--cyan)"
                      : isSubmitted && idx === question.correctIndex
                      ? "var(--success)"
                      : isSubmitted &&
                        selectedIndex === idx &&
                        idx !== question.correctIndex
                      ? "var(--danger)"
                      : "var(--bg-hover)",
                  color:
                    !isSubmitted && selectedIndex === idx
                      ? "#000"
                      : isSubmitted && idx === question.correctIndex
                      ? "#000"
                      : isSubmitted &&
                        selectedIndex === idx &&
                        idx !== question.correctIndex
                      ? "#fff"
                      : "var(--text-secondary)",
                }}
              >
                {OPTION_LABELS[idx]}
              </span>
              {/* Option HTML */}
              <MathJaxRenderer
                html={optHtml}
                className="flex-1 text-sm leading-relaxed"
                inline
              />
            </div>
          </button>
        ))}
      </div>

      {/* Source badge */}
      <div className="mt-4 flex items-center justify-between pl-0 md:pl-12">
        {isSubmitted && (
          <span
            className="text-xs font-medium"
            style={{
              color:
                selectedIndex === null
                  ? "var(--text-muted)"
                  : selectedIndex === question.correctIndex
                  ? "var(--success)"
                  : "var(--danger)",
            }}
          >
            {selectedIndex === null
              ? "Not attempted"
              : selectedIndex === question.correctIndex
              ? "✓ Correct"
              : "✗ Incorrect"}
          </span>
        )}
      </div>
    </div>
  );
}
