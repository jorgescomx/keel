"use client";

import React, { useRef, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import type { SelectOption } from "@/types";
import { cn } from "@/lib/utils";

interface MultiSelectDropdownProps {
  options: SelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder = "Select values...",
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter((o) => value.includes(o.id));

  const toggle = (optionId: string) => {
    const exists = value.includes(optionId);
    onChange(
      exists ? value.filter((id) => id !== optionId) : [...value, optionId]
    );
  };

  return (
    <div
      ref={ref}
      className="relative"
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[32px] flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-left text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium border"
                style={{
                  backgroundColor: `${opt.color}1c`,
                  borderColor: `${opt.color}48`,
                  color: opt.color,
                }}
              >
                {opt.label}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(opt.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      toggle(opt.id);
                    }
                  }}
                  className="hover:opacity-75"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </span>
            ))
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-xl max-h-48 overflow-y-auto p-1 space-y-0.5">
          {options.length === 0 ? (
            <div className="px-2.5 py-2 text-[11px] text-slate-400">
              No allowed values configured yet.
            </div>
          ) : (
            options.map((opt) => {
              const checked = value.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(opt.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                    checked
                      ? "bg-blue-50/80 dark:bg-blue-950/40"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: opt.color }}
                    />
                    <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                      {opt.label}
                    </span>
                  </span>
                  {checked && (
                    <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
