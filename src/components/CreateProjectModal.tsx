"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { COLOR_PALETTE, DynamicIcon, ICON_NAMES } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: (projectId: string) => Promise<void>;
}

export function CreateProjectModal({
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [nounSingular, setNounSingular] = useState("Task");
  const [nounPlural, setNounPlural] = useState("Tasks");
  const [icon, setIcon] = useState("FolderKanban");
  const [color, setColor] = useState("#3b82f6");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!keyTouched) {
      const derived = val
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 4);
      setKey(derived);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          key,
          description,
          icon,
          color,
          defaultNounSingular: nounSingular,
          defaultNounPlural: nounPlural,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create project");
        return;
      }
      await onCreated(data.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/70 dark:bg-[#1b1f2b]">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Create New Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Project Name *
              </label>
              <input
                type="text"
                autoFocus
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Core Mobile App"
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Key *
              </label>
              <input
                type="text"
                required
                maxLength={8}
                value={key}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                }}
                placeholder="APP"
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                What do you call items? (Singular)
              </label>
              <input
                type="text"
                value={nounSingular}
                onChange={(e) => {
                  setNounSingular(e.target.value);
                  setNounPlural(
                    e.target.value ? `${e.target.value}s` : "Items"
                  );
                }}
                placeholder="Task, Card, Deliverable, Idea..."
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Plural
              </label>
              <input
                type="text"
                value={nounPlural}
                onChange={(e) => setNounPlural(e.target.value)}
                placeholder="Tasks, Cards, Deliverables..."
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of this project..."
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full transition-transform",
                    color === c &&
                      "scale-110 ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-[#161922]"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Icon
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_NAMES.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={cn(
                    "h-8 w-8 rounded-md flex items-center justify-center border transition-colors",
                    icon === ic
                      ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <DynamicIcon name={ic} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !key.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
