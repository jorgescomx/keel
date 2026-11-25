"use client";

import React, { useRef, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  id: string;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}

interface ToolbarMultiFilterProps {
  label: string; // e.g. "Types", "Priorities", "Owner"
  allLabel: string; // e.g. "All Types"
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  removable?: boolean;
  onRemove?: () => void;
}

export function ToolbarMultiFilter({
  label,
  allLabel,
  options,
  selected,
  onChange,
  removable = false,
  onRemove,
}: ToolbarMultiFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = (id: string) => {
    const exists = selected.includes(id);
    onChange(exists ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const buttonText =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.label ?? `${label} (1)`
        : `${label} (${selected.length})`;

  const active = selected.length > 0;

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center"
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <div
        className={cn(
          "inline-flex items-center rounded-md border text-xs font-medium transition-colors",
          active
            ? "border-blue-500/60 bg-blue-50 dark:bg-blue-950/45 text-blue-700 dark:text-blue-300"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 focus:outline-none"
        >
          <span className="max-w-[140px] truncate">{buttonText}</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 opacity-60 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {removable && onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title={`Remove ${label} filter from bar`}
            className="pr-1.5 pl-0.5 py-1 text-slate-400 hover:text-red-500"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 min-w-[190px] max-w-[260px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
            {options.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-slate-400">
                No values available
              </div>
            ) : (
              options.map((opt) => {
                const checked = selected.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(opt.id)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                      checked
                        ? "bg-blue-50/90 dark:bg-blue-950/45 text-blue-700 dark:text-blue-300 font-semibold"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {opt.icon ? (
                        opt.icon
                      ) : opt.color ? (
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color }}
                        />
                      ) : null}
                      <span className="truncate">{opt.label}</span>
                    </span>
                    {checked && (
                      <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 p-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange([])}
                className="w-full rounded px-2 py-1 text-center text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
