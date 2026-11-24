"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Priority, ProjectBundle } from "@/types";
import { PRIORITY_LIST, PRIORITY_META } from "@/lib/icons";
import { getValidParentCandidates } from "@/lib/hierarchy";

interface CreateItemModalProps {
  bundle: ProjectBundle;
  defaults?: {
    statusId?: string;
    priority?: Priority;
    typeId?: string;
    parentId?: string | null;
    customFields?: Record<string, unknown>;
  };
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    description: string;
    typeId: string;
    statusId: string;
    priority: Priority;
    parentId: string | null;
    labels: string[];
    dueDate: string | null;
    customFields: Record<string, unknown>;
  }) => Promise<void>;
}

export function CreateItemModal({
  bundle,
  defaults,
  onClose,
  onCreate,
}: CreateItemModalProps) {
  const { project, itemTypes, statuses, customFields, items } = bundle;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState(
    defaults?.typeId ?? itemTypes[0]?.id ?? ""
  );
  const [statusId, setStatusId] = useState(
    defaults?.statusId ?? statuses[0]?.id ?? ""
  );
  const [priority, setPriority] = useState<Priority>(
    defaults?.priority ?? "medium"
  );
  const [parentId, setParentId] = useState<string>(defaults?.parentId ?? "");
  const [labelsRaw, setLabelsRaw] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cfValues, setCfValues] = useState<Record<string, unknown>>(
    defaults?.customFields ?? {}
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedType = itemTypes.find((t) => t.id === typeId);
  const validParents = getValidParentCandidates(
    null,
    typeId,
    items,
    itemTypes,
    Boolean(project.settings.enforceHierarchy)
  );
  const applicableFields = customFields.filter(
    (cf) =>
      cf.applicableTypeIds.length === 0 ||
      cf.applicableTypeIds.includes(typeId)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !typeId || !statusId) return;
    setSubmitting(true);
    try {
      const labels = labelsRaw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      await onCreate({
        title: title.trim(),
        description,
        typeId,
        statusId,
        priority,
        parentId: parentId || null,
        labels,
        dueDate: dueDate || null,
        customFields: cfValues,
      });
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
        className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/70 dark:bg-[#1b1f2b]">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Create {selectedType?.name ?? project.settings.defaultNounSingular}{" "}
            <span className="font-normal text-slate-400">
              in {project.name}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Type
              </label>
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-2 text-xs font-medium"
              >
                {itemTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Status
              </label>
              <select
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-2 text-xs font-medium"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Summary *
            </label>
            <input
              type="text"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`What needs to get done?`}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context, notes, or checklist..."
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-2 text-xs"
              >
                {PRIORITY_LIST.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Parent
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-2 text-xs"
              >
                <option value="">None</option>
                {validParents.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.key} · {i.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Labels (comma separated)
            </label>
            <input
              type="text"
              value={labelsRaw}
              onChange={(e) => setLabelsRaw(e.target.value)}
              placeholder="e.g. frontend, quick-win"
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
            />
          </div>

          {applicableFields.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
              {applicableFields.map((cf) => (
                <div key={cf.id}>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {cf.name}
                  </label>
                  {cf.fieldType === "select" ? (
                    <select
                      value={String(cfValues[cf.id] ?? "")}
                      onChange={(e) =>
                        setCfValues((prev) => ({
                          ...prev,
                          [cf.id]: e.target.value || undefined,
                        }))
                      }
                      className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                    >
                      <option value="">— None —</option>
                      {cf.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : cf.fieldType === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(cfValues[cf.id])}
                      onChange={(e) =>
                        setCfValues((prev) => ({
                          ...prev,
                          [cf.id]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded"
                    />
                  ) : (
                    <input
                      type={
                        cf.fieldType === "number"
                          ? "number"
                          : cf.fieldType === "date"
                            ? "date"
                            : "text"
                      }
                      value={String(cfValues[cf.id] ?? "")}
                      onChange={(e) =>
                        setCfValues((prev) => ({
                          ...prev,
                          [cf.id]:
                            cf.fieldType === "number" && e.target.value !== ""
                              ? Number(e.target.value)
                              : e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

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
              disabled={submitting || !title.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting
                ? "Creating..."
                : `Create ${selectedType?.name ?? project.settings.defaultNounSingular}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
