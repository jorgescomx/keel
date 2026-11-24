"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Trash2,
  Plus,
  GitBranch,
  MessageSquare,
  Send,
  CornerDownRight,
  Tag,
  ExternalLink,
} from "lucide-react";
import type {
  CustomFieldDef,
  ItemComment,
  Priority,
  ProjectBundle,
  WorkItem,
} from "@/types";
import { DynamicIcon, PRIORITY_LIST, PRIORITY_META, PriorityIcon } from "@/lib/icons";
import { getValidParentCandidates } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";

interface ItemDetailModalProps {
  bundle: ProjectBundle;
  item: WorkItem;
  onClose: () => void;
  onSelectItem: (item: WorkItem) => void;
  onUpdateItem: (itemId: string, patch: Partial<WorkItem>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onCreateSubitem: (parent: WorkItem, title: string) => Promise<void>;
}

function isSafeHttpUrl(val: unknown): val is string {
  if (typeof val !== "string" || !val.trim()) return false;
  try {
    const parsed = new URL(val.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function ItemDetailModal({
  bundle,
  item,
  onClose,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  onCreateSubitem,
}: ItemDetailModalProps) {
  const { project, itemTypes, statuses, customFields, items } = bundle;

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [labelInput, setLabelInput] = useState("");
  const [subitemTitle, setSubitemTitle] = useState("");
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description);
    setConfirmDelete(false);
  }, [item.id, item.title, item.description]);

  useEffect(() => {
    let active = true;
    fetch(`/api/items/${item.id}/comments`)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data)) setComments(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [item.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentType = itemTypes.find((t) => t.id === item.typeId);
  const parentItem = item.parentId
    ? items.find((i) => i.id === item.parentId)
    : undefined;
  const subitems = useMemo(
    () => items.filter((i) => i.parentId === item.id),
    [items, item.id]
  );

  const validParentCandidates = useMemo(
    () =>
      getValidParentCandidates(
        item.id,
        item.typeId,
        items,
        itemTypes,
        Boolean(project.settings.enforceHierarchy)
      ),
    [item.id, item.typeId, items, itemTypes, project.settings.enforceHierarchy]
  );

  const applicableCustomFields = useMemo(
    () =>
      customFields.filter(
        (cf) =>
          cf.applicableTypeIds.length === 0 ||
          cf.applicableTypeIds.includes(item.typeId)
      ),
    [customFields, item.typeId]
  );

  const saveTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== item.title) {
      onUpdateItem(item.id, { title: trimmed });
    }
  };

  const saveDescription = () => {
    if (description !== item.description) {
      onUpdateItem(item.id, { description });
    }
  };

  const addLabel = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = labelInput.trim().toLowerCase();
    if (!cleaned || item.labels.includes(cleaned)) {
      setLabelInput("");
      return;
    }
    onUpdateItem(item.id, { labels: [...item.labels, cleaned] });
    setLabelInput("");
  };

  const removeLabel = (label: string) => {
    onUpdateItem(item.id, { labels: item.labels.filter((l) => l !== label) });
  };

  const updateCustomField = (fieldId: string, value: unknown) => {
    onUpdateItem(item.id, {
      customFields: { ...item.customFields, [fieldId]: value },
    });
  };

  const handleAddSubitem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = subitemTitle.trim();
    if (!trimmed) return;
    setSubitemTitle("");
    await onCreateSubitem(item, trimmed);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setCommentBody("");
    const res = await fetch(`/api/items/${item.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });
    if (res.ok) {
      const created = await res.json();
      setComments((prev) => [...prev, created]);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    await fetch(`/api/items/${item.id}/comments?commentId=${commentId}`, {
      method: "DELETE",
    });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const renderCustomFieldInput = (cf: CustomFieldDef) => {
    const val = item.customFields[cf.id];

    switch (cf.fieldType) {
      case "select":
        return (
          <select
            value={typeof val === "string" ? val : ""}
            onChange={(e) => updateCustomField(cf.id, e.target.value || null)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">— None —</option>
            {cf.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "multi_select": {
        const selected = Array.isArray(val) ? (val as string[]) : [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {cf.options.map((o) => {
              const active = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? selected.filter((x) => x !== o.id)
                      : [...selected, o.id];
                    updateCustomField(cf.id, next);
                  }}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-medium border transition-all",
                    active
                      ? "ring-1 ring-offset-1 dark:ring-offset-[#161922]"
                      : "opacity-55 hover:opacity-100"
                  )}
                  style={{
                    backgroundColor: active ? `${o.color}22` : "transparent",
                    borderColor: `${o.color}60`,
                    color: o.color,
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      case "checkbox":
        return (
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(val)}
              onChange={(e) => updateCustomField(cf.id, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{val ? "Enabled" : "Disabled"}</span>
          </label>
        );
      case "number":
        return (
          <input
            type="number"
            defaultValue={val !== undefined && val !== null ? String(val) : ""}
            onBlur={(e) =>
              updateCustomField(
                cf.id,
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            placeholder="0"
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={typeof val === "string" ? val : ""}
            onChange={(e) => updateCustomField(cf.id, e.target.value || null)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        );
      case "url":
        return (
          <div className="flex items-center gap-1.5">
            <input
              type="url"
              defaultValue={typeof val === "string" ? val : ""}
              onBlur={(e) => updateCustomField(cf.id, e.target.value.trim() || null)}
              placeholder="https://..."
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {isSafeHttpUrl(val) && (
              <a
                href={val.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        );
      default:
        return (
          <input
            type="text"
            defaultValue={typeof val === "string" ? val : ""}
            onBlur={(e) => updateCustomField(cf.id, e.target.value.trim() || null)}
            placeholder={`Enter ${cf.name.toLowerCase()}...`}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-5xl max-h-[88vh] rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#161922] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3 bg-slate-50/70 dark:bg-[#1b1f2b]">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {parentItem && (
              <>
                <button
                  type="button"
                  onClick={() => onSelectItem(parentItem)}
                  className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 font-medium"
                >
                  <span className="font-mono">{parentItem.key}</span>
                  <span className="max-w-[160px] truncate">
                    {parentItem.title}
                  </span>
                </button>
                <span>/</span>
              </>
            )}
            {currentType && (
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded"
                style={{
                  backgroundColor: `${currentType.color}1a`,
                  color: currentType.color,
                }}
              >
                <DynamicIcon name={currentType.icon} className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
              {item.key}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title={`Delete ${currentType?.name ?? project.settings.defaultNounSingular}`}
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Two-column Jira-style Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_310px] overflow-hidden">
          {/* Left Column: Title, Description, Sub-items, Comments */}
          <div className="overflow-y-auto p-6 space-y-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-full text-xl font-bold text-slate-900 dark:text-slate-50 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-md px-2 py-1 -mx-2 focus:outline-none"
            />

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Description
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                placeholder="Add details, acceptance criteria, or notes..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-[#11141d] px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y"
              />
            </div>

            {/* Sub-items */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Sub-items ({subitems.length})
                </span>
              </div>
              <div className="space-y-1.5 mb-2.5">
                {subitems.map((child) => {
                  const childType = itemTypes.find((t) => t.id === child.typeId);
                  const childStatus = statuses.find(
                    (s) => s.id === child.statusId
                  );
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => onSelectItem(child)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1a1e2a] px-3 py-2 text-left hover:border-blue-400/70 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CornerDownRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {childType && (
                          <DynamicIcon
                            name={childType.icon}
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: childType.color }}
                          />
                        )}
                        <span className="font-mono text-[11px] font-semibold text-slate-500 shrink-0">
                          {child.key}
                        </span>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                          {child.title}
                        </span>
                      </div>
                      {childStatus && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold shrink-0"
                          style={{
                            backgroundColor: `${childStatus.color}18`,
                            color: childStatus.color,
                          }}
                        >
                          {childStatus.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <form onSubmit={handleAddSubitem} className="flex gap-2">
                <input
                  type="text"
                  value={subitemTitle}
                  onChange={(e) => setSubitemTitle(e.target.value)}
                  placeholder={`Add a child ${project.settings.defaultNounSingular.toLowerCase()}...`}
                  className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </form>
            </div>

            {/* Activity / Notes */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <MessageSquare className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Notes & Activity ({comments.length})
                </span>
              </div>

              <div className="space-y-2.5 mb-3">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="group rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1a1e2a] p-3"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {c.author}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>
                          {new Date(c.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {c.body}
                    </p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Write a note or update..."
                  className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Fields & Metadata */}
          <div className="overflow-y-auto p-5 space-y-4 bg-slate-50/40 dark:bg-[#131620]">
            {/* Status */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Status
              </label>
              <select
                value={item.statusId}
                onChange={(e) =>
                  onUpdateItem(item.id, { statusId: e.target.value })
                }
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Item Type */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Type
              </label>
              <select
                value={item.typeId}
                onChange={(e) =>
                  onUpdateItem(item.id, { typeId: e.target.value })
                }
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {itemTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Priority
              </label>
              <div className="flex items-center gap-2">
                <PriorityIcon priority={item.priority} className="h-4 w-4 shrink-0" />
                <select
                  value={item.priority}
                  onChange={(e) =>
                    onUpdateItem(item.id, {
                      priority: e.target.value as Priority,
                    })
                  }
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {PRIORITY_LIST.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Parent */}
            <div>
              <label className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                <span>Parent</span>
                {project.settings.enforceHierarchy && currentType && (
                  <span className="font-mono text-[10px] font-normal text-blue-500">
                    L{currentType.level}
                  </span>
                )}
              </label>
              <select
                value={item.parentId ?? ""}
                onChange={(e) =>
                  onUpdateItem(item.id, { parentId: e.target.value || null })
                }
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="">
                  {project.settings.enforceHierarchy &&
                  validParentCandidates.length === 0
                    ? "— Top-level tier —"
                    : "— None —"}
                </option>
                {validParentCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.key} · {candidate.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={item.dueDate ?? ""}
                onChange={(e) =>
                  onUpdateItem(item.id, { dueDate: e.target.value || null })
                }
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            {/* Labels */}
            <div>
              <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                <Tag className="h-3 w-3" />
                Labels
              </label>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {item.labels.map((label) => (
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
              <form onSubmit={addLabel}>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="Add label & press Enter"
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </form>
            </div>

            {/* Custom Fields */}
            {applicableCustomFields.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Custom Fields
                </div>
                {applicableCustomFields.map((cf) => (
                  <div key={cf.id}>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {cf.name}
                    </label>
                    {renderCustomFieldInput(cf)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
