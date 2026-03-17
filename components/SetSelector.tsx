"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Loader,
  Minus,
} from "lucide-react";
import type { SetsApiResponse, SubjectGroup } from "@/lib/types";

interface SetSelectorProps {
  /** Currently selected source values (e.g. ["biology_set_1", "math_set_3"]) */
  selected: string[];
  onChange: (sources: string[]) => void;
}

export default function SetSelector({ selected, onChange }: SetSelectorProps) {
  const [groups, setGroups] = useState<Record<string, SubjectGroup>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/sets")
      .then((r) => r.json())
      .then((data: SetsApiResponse) => {
        setGroups(data.groups ?? {});
        setTotal(data.total ?? 0);
        // Auto-expand first subject if there's only one, or if total sets < 20
        const keys = Object.keys(data.groups ?? {});
        if (keys.length === 1 || (data.total ?? 0) <= 20) {
          setExpanded(new Set(keys));
        }
      })
      .catch(() => setFetchError("Could not load sets from /data directory."))
      .finally(() => setLoading(false));
  }, []);

  const selectedSet = new Set(selected);

  const toggleOne = useCallback(
    (value: string) => {
      const next = new Set(selectedSet);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      onChange(Array.from(next));
    },
    [selectedSet, onChange]
  );

  const toggleSubject = useCallback(
    (sets: { value: string }[]) => {
      const allSelected = sets.every((s) => selectedSet.has(s.value));
      const next = new Set(selectedSet);
      if (allSelected) sets.forEach((s) => next.delete(s.value));
      else sets.forEach((s) => next.add(s.value));
      onChange(Array.from(next));
    },
    [selectedSet, onChange]
  );

  const toggleExpand = (subject: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(subject) ? next.delete(subject) : next.add(subject);
      return next;
    });

  const expandAll = () => setExpanded(new Set(Object.keys(groups)));
  const collapseAll = () => setExpanded(new Set());

  // ── Filter subjects by search term ────────────────────────────────────────
  const lSearch = search.toLowerCase();
  const filteredEntries = Object.entries(groups).filter(
    ([, g]) =>
      !lSearch ||
      g.label.toLowerCase().includes(lSearch) ||
      g.sets.some((s) => s.value.toLowerCase().includes(lSearch))
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3" style={{ color: "var(--text-muted)" }}>
        <Loader size={15} className="animate-spin" />
        <span className="text-sm">Scanning question sets…</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <p className="text-sm py-2" style={{ color: "var(--danger)" }}>
        {fetchError}
      </p>
    );
  }

  const subjectCount = Object.keys(groups).length;

  return (
    <div className="space-y-3">
      {/* Search + expand controls */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${subjectCount} subjects · ${total} files total`}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--accent)";
              e.target.style.boxShadow = "0 0 0 3px var(--accent-glow)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--border-subtle)";
              e.target.style.boxShadow = "none";
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            Collapse
          </button>
        </div>
      </div>

      {/* Subject accordion list */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--border-subtle)",
          maxHeight: "340px",
          overflowY: "auto",
        }}
      >
        {filteredEntries.length === 0 ? (
          <p className="text-sm p-5 text-center" style={{ color: "var(--text-muted)" }}>
            No subjects match <em>"{search}"</em>
          </p>
        ) : (
          filteredEntries.map(([subject, group], idx) => {
            const isExpanded = expanded.has(subject);
            const selCount = group.sets.filter((s) => selectedSet.has(s.value)).length;
            const allSel = selCount === group.sets.length && group.sets.length > 0;
            const someSel = selCount > 0 && !allSel;

            // When searching, filter the visible sets too
            const visibleSets = lSearch
              ? group.sets.filter((s) => s.value.toLowerCase().includes(lSearch))
              : group.sets;

            return (
              <div
                key={subject}
                style={{
                  borderBottom:
                    idx < filteredEntries.length - 1
                      ? "1px solid var(--border-subtle)"
                      : "none",
                }}
              >
                {/* ── Subject header ─────────────────────────────────────── */}
                <div
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  {/* Tri-state select-all checkbox */}
                  <button
                    type="button"
                    title={allSel ? "Deselect all" : "Select all"}
                    onClick={() => toggleSubject(group.sets)}
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      background:
                        allSel
                          ? "var(--accent)"
                          : someSel
                          ? "rgba(245,158,11,0.3)"
                          : "var(--bg-surface)",
                      border: `1px solid ${
                        allSel || someSel ? "var(--accent)" : "var(--border-strong)"
                      }`,
                    }}
                  >
                    {allSel && <Check size={11} color="#000" strokeWidth={3} />}
                    {someSel && <Minus size={11} style={{ color: "var(--accent)" }} />}
                  </button>

                  {/* Subject label + badge — clicking expands */}
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                    onClick={() => toggleExpand(subject)}
                  >
                    <span
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {group.label}
                    </span>
                    {/* Count badge */}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-mono-exam flex-shrink-0"
                      style={{
                        background: selCount > 0 ? "var(--accent-glow)" : "var(--bg-hover)",
                        color: selCount > 0 ? "var(--accent)" : "var(--text-muted)",
                        border: `1px solid ${
                          selCount > 0 ? "var(--accent)" : "var(--border-subtle)"
                        }`,
                      }}
                    >
                      {selCount > 0 ? `${selCount}/` : ""}
                      {group.sets.length}
                    </span>
                  </button>

                  {/* Expand chevron */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(subject)}
                    className="flex-shrink-0 transition-transform duration-150"
                    style={{
                      color: "var(--text-muted)",
                      transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>

                {/* ── Sets grid ──────────────────────────────────────────── */}
                {isExpanded && (
                  <div
                    className="px-3 py-3 flex flex-wrap gap-1.5"
                    style={{ background: "var(--bg-surface)" }}
                  >
                    {visibleSets.map((set) => {
                      const isSel = selectedSet.has(set.value);
                      return (
                        <button
                          key={set.value}
                          type="button"
                          title={set.value}
                          onClick={() => toggleOne(set.value)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-mono-exam font-medium transition-all"
                          style={{
                            background: isSel ? "var(--accent-glow)" : "var(--bg-elevated)",
                            border: `1px solid ${isSel ? "var(--accent)" : "var(--border-subtle)"}`,
                            color: isSel ? "var(--accent)" : "var(--text-secondary)",
                          }}
                        >
                          {set.label}
                        </button>
                      );
                    })}
                    {visibleSets.length === 0 && (
                      <p className="text-xs py-1" style={{ color: "var(--text-muted)" }}>
                        No sets match the search.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div
          className="rounded-xl p-3"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {selected.length} set{selected.length !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs"
              style={{ color: "var(--danger)" }}
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {selected.sort().map((src) => (
              <span
                key={src}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono-exam"
                style={{
                  background: "var(--accent-glow)",
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                }}
              >
                {src}
                <button type="button" onClick={() => toggleOne(src)}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
