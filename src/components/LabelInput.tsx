"use client";

import React, { useMemo, useRef, useState } from "react";
import { X, Sparkles, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface LabelInputProps {
  value: string[];
  existingLabels: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

export function LabelInput({
  value,
  existingLabels,
  onChange,
  placeholder = "Add label...",
}: LabelInputProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Deduplicate project labels case-insensitively (keeping first canonical spelling)
  const canonicalLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const raw of existingLabels) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) map.set(key, trimmed);
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [existingLabels]);

  const selectedLower = useMemo(
    () => new Set(value.map((l) => l.toLowerCase())),
    [value]
  );

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Case-insensitive exact match among existing project labels
  const caseMatch = useMemo(() => {
    if (!trimmed) return null;
    return canonicalLabels.find((l) => l.toLowerCase() === lower) ?? null;
  }, [canonicalLabels, trimmed, lower]);

  // Suggestions: substring matches + fuzzy/similar matches (e.g. typo, singular/plural)
  const suggestions = useMemo(() => {
    const available = canonicalLabels.filter(
      (l) => !selectedLower.has(l.toLowerCase())
    );
    if (!trimmed) return available.slice(0, 8);

    const scored: { label: string; reason: "case" | "match" | "similar"; score: number }[] = [];

    for (const label of available) {
      const lLow = label.toLowerCase();
      if (lLow === lower) {
        scored.push({ label, reason: "case", score: 0 });
      } else if (lLow.startsWith(lower)) {
        scored.push({ label, reason: "match", score: 1 });
      } else if (lLow.includes(lower) || lower.includes(lLow)) {
        scored.push({ label, reason: "match", score: 2 });
      } else if (trimmed.length >= 3) {
        const dist = levenshtein(lower, lLow);
        const maxDist = trimmed.length >= 6 ? 2 : 1;
        if (dist <= maxDist) {
          scored.push({ label, reason: "similar", score: 3 + dist });
        }
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
      .slice(0, 6);
  }, [canonicalLabels, selectedLower, trimmed, lower]);

  const addLabel = (rawLabel: string) => {
    const cleaned = rawLabel.trim();
    if (!cleaned) return;
    if (selectedLower.has(cleaned.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, cleaned]);
    setInput("");
    setOpen(false);
  };

  const removeLabel = (label: string) => {
    onChange(value.filter((l) => l !== label));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (!trimmed) return;
      // If an existing label differs only by case, reuse the canonical existing label
      if (caseMatch) {
        addLabel(caseMatch);
      } else {
        addLabel(trimmed);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeLabel(value[value.length - 1]);
    }
  };

  const showCreateNew =
    trimmed.length > 0 &&
    !caseMatch &&
    !selectedLower.has(lower);

  const similarHint =
    trimmed.length > 0 && !caseMatch
      ? suggestions.find((s) => typeof s !== "string" && s.reason === "similar")
      : null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      {/* Selected label chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {value.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300"
            >
              {label}
              <button
                type="button"
                onClick={() => removeLabel(label)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={input}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />

      {/* Dropdown with existing / case-match / similar suggestions */}
      {open && (suggestions.length > 0 || showCreateNew || caseMatch) && (
        <div className="absolute left-0 right-0 mt-1 z-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {/* Exact case-difference warning */}
          {caseMatch && caseMatch !== trimmed && !selectedLower.has(lower) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addLabel(caseMatch)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs bg-amber-50/90 dark:bg-amber-950/35 hover:bg-amber-100/80 dark:hover:bg-amber-950/60 border-b border-amber-200/70 dark:border-amber-800/50"
            >
              <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Use existing <strong>&ldquo;{caseMatch}&rdquo;</strong>{" "}
                  <span className="text-[10.5px] opacity-80">
                    (same label, different case)
                  </span>
                </span>
              </span>
              <Check className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            </button>
          )}

          {/* Already selected notice */}
          {caseMatch && selectedLower.has(lower) && (
            <div className="px-3 py-2 text-[11px] text-slate-400">
              &ldquo;{caseMatch}&rdquo; is already added.
            </div>
          )}

          {/* Matching / similar existing labels */}
          {suggestions.map((entry) => {
            const label = typeof entry === "string" ? entry : entry.label;
            const reason = typeof entry === "string" ? "match" : entry.reason;
            if (caseMatch && label === caseMatch && caseMatch !== trimmed) {
              return null; // already shown in amber banner above
            }
            return (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addLabel(label)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-950/40",
                  reason === "similar" && "bg-blue-50/40 dark:bg-blue-950/20"
                )}
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {label}
                </span>
                {reason === "similar" ? (
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                    Similar existing
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Existing</span>
                )}
              </button>
            );
          })}

          {/* Create new option */}
          {showCreateNew && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addLabel(trimmed)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border-t border-slate-100 dark:border-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>
                Create &ldquo;{trimmed}&rdquo;
                {similarHint && typeof similarHint !== "string"
                  ? ` (or pick "${similarHint.label}" above)`
                  : ""}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
