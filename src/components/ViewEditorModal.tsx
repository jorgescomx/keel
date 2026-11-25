"use client";

import React, { useMemo, useState } from "react";
import {
  X,
  Columns3,
  List,
  Trash2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { CustomSwimline, ProjectBundle, ProjectView } from "@/types";
import { COLOR_PALETTE } from "@/lib/icons";
import { compileQuery } from "@/lib/query";
import { cn } from "@/lib/utils";

interface ViewEditorModalProps {
  bundle: ProjectBundle;
  editingView?: ProjectView | null;
  initialDraft?: {
    layout: "board" | "list";
    query: string;
    hiddenStatusIds: string[];
    swimlaneBy: string;
    customSwimlines?: CustomSwimline[];
    compact: boolean;
  };
  canDelete: boolean;
  onClose: () => void;
  onSaved: (savedView: ProjectView) => Promise<void>;
  onDeleted?: (viewId: string) => Promise<void>;
}

export function ViewEditorModal({
  bundle,
  editingView,
  initialDraft,
  canDelete,
  onClose,
  onSaved,
  onDeleted,
}: ViewEditorModalProps) {
  const { project, statuses, customFields, itemTypes, items } = bundle;
  const isEdit = Boolean(editingView);

  const [name, setName] = useState(editingView?.name ?? "");
  const [layout, setLayout] = useState<"board" | "list">(
    editingView?.layout ?? initialDraft?.layout ?? "board"
  );
  const [query, setQuery] = useState(
    editingView?.query ?? initialDraft?.query ?? ""
  );
  const [hiddenStatusIds, setHiddenStatusIds] = useState<string[]>(
    editingView?.hiddenStatusIds ?? initialDraft?.hiddenStatusIds ?? []
  );
  const [swimlaneBy, setSwimlaneBy] = useState(
    initialDraft?.swimlaneBy ?? editingView?.swimlaneBy ?? "none"
  );
  const [customSwimlines, setCustomSwimlines] = useState<CustomSwimline[]>(
    initialDraft?.customSwimlines ??
      editingView?.filters?.customSwimlines ??
      []
  );
  const [compact, setCompact] = useState(
    editingView?.compact ?? initialDraft?.compact ?? false
  );
  const [submitting, setSubmitting] = useState(false);

  const addCustomSwimline = (preset?: {
    name: string;
    query: string;
    color: string;
  }) => {
    setCustomSwimlines((prev) => [
      ...prev,
      {
        id: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: preset?.name ?? `Swimline ${prev.length + 1}`,
        query: preset?.query ?? "",
        color: preset?.color ?? COLOR_PALETTE[prev.length % COLOR_PALETTE.length],
      },
    ]);
  };

  const updateCustomSwimline = (
    laneId: string,
    patch: Partial<CustomSwimline>
  ) => {
    setCustomSwimlines((prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, ...patch } : l))
    );
  };

  const moveCustomSwimline = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= customSwimlines.length) return;
    setCustomSwimlines((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const removeCustomSwimline = (laneId: string) => {
    setCustomSwimlines((prev) => prev.filter((l) => l.id !== laneId));
  };

  const selectFields = useMemo(
    () => customFields.filter((cf) => cf.fieldType === "select"),
    [customFields]
  );

  const queryCheck = useMemo(
    () =>
      compileQuery(query, {
        itemTypes,
        statuses,
        customFields,
        allItems: items,
      }),
    [query, itemTypes, statuses, customFields, items]
  );

  const matchCount = useMemo(() => {
    if (!queryCheck.ok) return 0;
    return items.filter(queryCheck.matches).length;
  }, [queryCheck, items]);

  const toggleHiddenStatus = (statusId: string) => {
    setHiddenStatusIds((prev) => {
      const isHidden = prev.includes(statusId);
      if (isHidden) return prev.filter((id) => id !== statusId);
      // Keep at least 1 visible column
      if (statuses.length - prev.length <= 1) return prev;
      return [...prev, statusId];
    });
  };

  const exampleQueries = useMemo(() => {
    const firstType = itemTypes[0]?.name ?? "Task";
    const firstSelect = selectFields[0];
    const list = [
      `priority in (urgent, high)`,
      `type = ${firstType}`,
      `status != Done`,
    ];
    if (firstSelect && firstSelect.options[0]) {
      list.push(`${firstSelect.name} = ${firstSelect.options[0].label}`);
    }
    return list;
  }, [itemTypes, selectFields]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !queryCheck.ok) return;
    setSubmitting(true);
    try {
      const url = isEdit
        ? `/api/projects/${project.id}/views/${editingView!.id}`
        : `/api/projects/${project.id}/views`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          layout,
          query: query.trim(),
          filters: {
            ...(editingView?.filters ?? {}),
            customSwimlines: customSwimlines.filter((l) => l.name.trim()),
          },
          hiddenStatusIds,
          swimlaneBy,
          compact,
        }),
      });
      if (res.ok) {
        const saved: ProjectView = await res.json();
        await onSaved(saved);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingView || !onDeleted) return;
    if (!window.confirm(`Delete view "${editingView.name}"?`)) return;
    await fetch(`/api/projects/${project.id}/views/${editingView.id}`, {
      method: "DELETE",
    });
    await onDeleted(editingView.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/70 dark:bg-[#1b1f2b]">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {isEdit ? `Edit View: ${editingView!.name}` : "Create Custom View / Board"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                View Name *
              </label>
              <input
                type="text"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Urgent Triage, Frontend Board, QA Queue"
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Layout
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLayout("board")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-semibold transition-colors",
                    layout === "board"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                      : "border-slate-200 dark:border-slate-700 text-slate-500"
                  )}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  Board
                </button>
                <button
                  type="button"
                  onClick={() => setLayout("list")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-semibold transition-colors",
                    layout === "list"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                      : "border-slate-200 dark:border-slate-700 text-slate-500"
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  List
                </button>
              </div>
            </div>
          </div>

          {/* JQL-style Filter Query */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <Sparkles className="h-3 w-3 text-blue-500" />
                Filter Query (JQL-style)
              </label>
              {query.trim() &&
                (queryCheck.ok ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Matches {matchCount}{" "}
                    {matchCount === 1
                      ? project.settings.defaultNounSingular.toLowerCase()
                      : project.settings.defaultNounPlural.toLowerCase()}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                    <AlertCircle className="h-3 w-3" />
                    {queryCheck.error}
                  </span>
                ))}
            </div>
            <textarea
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Leave empty to show all, or e.g. priority in (urgent, high) AND status != Done'
              className={cn(
                "w-full rounded-md border bg-white dark:bg-[#11141d] px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2",
                query.trim() && !queryCheck.ok
                  ? "border-red-400 focus:ring-red-500/30"
                  : "border-slate-200 dark:border-slate-700 focus:ring-blue-500/40"
              )}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] text-slate-400">Examples:</span>
              {exampleQueries.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setQuery(ex)}
                  className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[10.5px] text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {layout === "board" && (
            <>
              {/* Visible Columns */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Visible Columns on this Board
                </label>
                <div className="flex flex-wrap gap-2">
                  {statuses.map((s) => {
                    const visible = !hiddenStatusIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleHiddenStatus(s.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all",
                          visible
                            ? "border-blue-500/50 bg-blue-50/70 dark:bg-blue-950/35 text-slate-800 dark:text-slate-100"
                            : "border-slate-200 dark:border-slate-700 text-slate-400 line-through opacity-60"
                        )}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Default Swimline + Density */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Default Swimlines
                  </label>
                  <select
                    value={swimlaneBy}
                    onChange={(e) => setSwimlaneBy(e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                  >
                    <option value="none">None</option>
                    <option value="priority">Priority</option>
                    <option value="type">Item Type</option>
                    <option value="owner">Owner</option>
                    <option value="parent">Parent Item</option>
                    <option value="custom">Custom Queries</option>
                    {selectFields.map((cf) => (
                      <option key={cf.id} value={`cf:${cf.id}`}>
                        {cf.name} (Custom)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end pb-1.5">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compact}
                      onChange={(e) => setCompact(e.target.checked)}
                      className="h-4 w-4 rounded text-blue-600"
                    />
                    Compact cards
                  </label>
                </div>
              </div>

              {/* Custom Query Swimlines Builder */}
              {swimlaneBy === "custom" && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-[#11141d] p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        Custom Query Swimlines
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Evaluated top-to-bottom (first match wins). Unmatched
                        cards go to &ldquo;Everything Else&rdquo;.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          addCustomSwimline({
                            name: "Expedite",
                            query: "priority = urgent",
                            color: "#ef4444",
                          })
                        }
                        className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] px-2 py-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-500"
                      >
                        + Expedite
                      </button>
                      <button
                        type="button"
                        onClick={() => addCustomSwimline()}
                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                      >
                        <Plus className="h-3 w-3" />
                        Add Swimline
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {customSwimlines.map((lane, idx) => {
                      const check = compileQuery(lane.query, {
                        itemTypes,
                        statuses,
                        customFields,
                        allItems: items,
                      });
                      const laneMatches =
                        lane.query.trim() && check.ok
                          ? items.filter(check.matches).length
                          : null;

                      return (
                        <div
                          key={lane.id}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] p-2.5 space-y-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveCustomSwimline(idx, -1)}
                                className="text-slate-400 hover:text-slate-700 disabled:opacity-25"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === customSwimlines.length - 1}
                                onClick={() => moveCustomSwimline(idx, 1)}
                                className="text-slate-400 hover:text-slate-700 disabled:opacity-25"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                            </div>
                            <input
                              type="color"
                              value={lane.color}
                              onChange={(e) =>
                                updateCustomSwimline(lane.id, {
                                  color: e.target.value,
                                })
                              }
                              className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent shrink-0"
                            />
                            <input
                              type="text"
                              value={lane.name}
                              onChange={(e) =>
                                updateCustomSwimline(lane.id, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="Swimline name"
                              className="w-36 rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 text-xs font-semibold"
                            />
                            <input
                              type="text"
                              value={lane.query}
                              onChange={(e) =>
                                updateCustomSwimline(lane.id, {
                                  query: e.target.value,
                                })
                              }
                              placeholder="e.g. priority = urgent OR label = blocker"
                              className={cn(
                                "flex-1 min-w-0 rounded border bg-transparent px-2 py-1 font-mono text-[11px] focus:outline-none",
                                lane.query.trim() && !check.ok
                                  ? "border-red-400"
                                  : "border-slate-200 dark:border-slate-700"
                              )}
                            />
                            <button
                              type="button"
                              onClick={() => removeCustomSwimline(lane.id)}
                              className="rounded p-1 text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {lane.query.trim() && (
                            <div className="pl-12 text-[10.5px]">
                              {check.ok ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Matches {laneMatches} item
                                  {laneMatches === 1 ? "" : "s"}
                                </span>
                              ) : (
                                <span className="text-red-500">
                                  {check.error}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {customSwimlines.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-slate-400">
                        No custom swimlines yet. Click <strong>+ Expedite</strong>{" "}
                        or <strong>+ Add Swimline</strong> above.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            {isEdit && canDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete View
              </button>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim() || !queryCheck.ok}
                className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting
                  ? "Saving..."
                  : isEdit
                    ? "Save View"
                    : "Create View"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
