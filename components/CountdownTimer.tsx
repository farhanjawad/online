"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  /** Target timestamp (ms) at which timer hits 00:00 */
  targetMs: number;
  /** Called when countdown reaches 0 */
  onExpire?: () => void;
  /** Visual variant */
  variant?: "card" | "exam-header";
  /** Class overrides */
  className?: string;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CountdownTimer({
  targetMs,
  onExpire,
  variant = "card",
  className = "",
}: CountdownTimerProps) {
  const calcRemaining = useCallback(() => {
    return Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
  }, [targetMs]);

  const [remaining, setRemaining] = useState(calcRemaining);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    setRemaining(calcRemaining());

    const tick = () => {
      const secs = calcRemaining();
      setRemaining(secs);

      if (secs === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetMs, calcRemaining, onExpire]);

  const isCritical = remaining <= 300 && remaining > 0; // last 5 minutes
  const isExpired = remaining === 0;

  // ── Exam Header Variant ───────────────────────────────────────────────────
  if (variant === "exam-header") {
    return (
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-xl ${className} ${
          isCritical ? "timer-critical" : ""
        }`}
        style={{
          background: isCritical
            ? "rgba(239,68,68,0.1)"
            : isExpired
            ? "rgba(239,68,68,0.2)"
            : "var(--bg-elevated)",
          border: `1px solid ${
            isCritical || isExpired
              ? "var(--danger)"
              : "var(--border-strong)"
          }`,
        }}
      >
        <Clock
          size={16}
          style={{
            color: isCritical || isExpired ? "var(--danger)" : "var(--accent)",
          }}
        />
        <span
          className="font-mono-exam font-semibold text-lg tabular-nums"
          style={{
            color: isCritical || isExpired ? "var(--danger)" : "var(--text-primary)",
            letterSpacing: "0.08em",
          }}
        >
          {isExpired ? "TIME'S UP" : formatTime(remaining)}
        </span>
      </div>
    );
  }

  // ── Card Variant (for student exam list) ─────────────────────────────────
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Clock size={13} style={{ color: "var(--text-muted)" }} />
      <span
        className="font-mono-exam text-xs tabular-nums"
        style={{ color: "var(--text-muted)" }}
      >
        {formatTime(remaining)}
      </span>
    </div>
  );
}
