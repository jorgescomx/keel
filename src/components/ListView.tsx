"use client";

import React, { useMemo, useState } from "react";
import {
  Calendar,
  Plus,
  ChevronDown,
  ChevronRight,
  GitBranch,
  List as ListIcon,
  Network,
} from "lucide-react";
import type {
  ItemType,
  Priority,
  ProjectBundle,
  StatusColumn,
  WorkItem,
} from "@/types";
import { DynamicIcon, PRIORITY_LIST, PRIORITY_META, PriorityIcon } from "@/lib/icons";
import { cn, formatShortDate, isOverdue } from "@/lib/utils";

interface ListViewProps {
  bundle: ProjectBundle;
  filteredItems: WorkItem[];
  onSelectItem: (item: WorkItem) => void;
  onUpdateItem: (itemId: string, patch: Partial<WorkItem>) => Promise<void>;
  onQuickCreate: () => void;
}

interface TreeRow {
  item: WorkItem;
  depth: number;
  childCount: number;
}

export function ListView({
  bundle,
  filteredItems,
  onSelectItem,
  onUpdateItem,
  onQuickCreate,
}: ListViewProps) {
  const { project, itemTypes, statuses, customFields } = bundle;
  const [treeMode, setTreeMode] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const typeMap = useMemo(
    () => new Map<string, ItemType>(itemTypes.map((t) => [t.id, t])),
    [itemTypes]
  );
  const statusMap = useMemo(
    () => new Map<string, StatusColumn>(statuses.map((s) => [s.id, s])),
    [statuses]
  );

  // Build ordered rows (flat or hierarchical tree)
  const rows: TreeRow[] = useMemo(() => {
    if (!treeMode) {
      return filteredItems.map((item) => ({ item, depth: 0, childCount: 0 }));
    }

    const visibleIds = new Set(filteredItems.map((i) => i.id));
    const childrenByParent = new Map<string, WorkItem[]>();
    const roots: WorkItem[] = [];

    for (const item of filteredItems) {
      if (item.parentId && visibleIds.has(item.parentId)) {
        const list = childrenByParent.get(item.parentId) ?? [];
        list.push(item);
        childrenByParent.set(item.parentId, list);
      } else {
        roots.push(item);
      }
    }

    // Sort roots by type level (top tiers first), then number
    const sortByLevel = (a: WorkItem, b: WorkItem) => {
      const la = typeMap.get(a.typeId)?.level ?? 2;
      const lb = typeMap.get(b.typeId)?.level ?? 2;
      return la - lb || a.number - b.number;
    };
    roots.sort(sortByLevel);

    const out: TreeRow[] = [];
    const visited = new Set<string>();

    const visit = (item: WorkItem, depth: number) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      const kids = (childrenByParent.get(item.id) ?? []).sort(sortByLevel);
      out.push({ item, depth, childCount: kids.length });
      if (!collapsed[item.id]) {
        for (const k of kids) {
          visit(k, depth + 1);
        }
      }
    };

    for (const root of roots) {
      visit(root, 0);
    }

    // Safety net for any disconnected cycle
    for (const item of filteredItems) {
      if (!visited.has(item.id)) {
        visit(item, 0);
      }
    }

    return out;
  }, [filteredItems, treeMode, collapsed, typeMap]);

  const toggleCollapse = (itemId: string) => {
    setCollapsed((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] overflow-hidden shadow-xs">
        {/* Top bar: Tree / Flat toggle */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1b1f2b]/60">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] p-0.5">
            <button
              type="button"
              onClick={() => setTreeMode(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                treeMode
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <Network className="h-3.5 w-3.5" />
              Hierarchy Tree
            </button>
            <button
              type="button"
              onClick={() => setTreeMode(false)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                !treeMode
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
              Flat List
            </button>
          </div>

          {treeMode && (
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setCollapsed({})}
                className="font-medium text-slate-500 hover:text-blue-600"
              >
                Expand all
              </button>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const i of filteredItems) next[i.id] = true;
                  setCollapsed(next);
                }}
                className="font-medium text-slate-500 hover:text-blue-600"
              >
                Collapse all
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-[#1b1f2b] text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-4 pr-3 w-28">Key</th>
                <th className="py-2.5 px-3 w-36">Type</th>
                <th className="py-2.5 px-3 min-w-[280px]">Title</th>
                <th className="py-2.5 px-3 w-40">Status</th>
                <th className="py-2.5 px-3 w-32">Priority</th>
                <th className="py-2.5 px-3 w-28">Due</th>
                {customFields.slice(0, 3).map((cf) => (
                  <th key={cf.id} className="py-2.5 px-3 min-w-[120px]">
                    {cf.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {rows.map(({ item, depth, childCount }) => {
                const type = typeMap.get(item.typeId);
                const status = statusMap.get(item.statusId);
                const overdue = isOverdue(item.dueDate);
                const isCollapsed = Boolean(collapsed[item.id]);

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className="group hover:bg-blue-50/45 dark:hover:bg-blue-950/20 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pl-4 pr-3 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {item.key}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {type && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded"
                            style={{
                              backgroundColor: `${type.color}1a`,
                              color: type.color,
                            }}
                          >
                            <DynamicIcon name={type.icon} className="h-3 w-3" />
                          </span>
                          <span>{type.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            L{type.level}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div
                        className="flex items-center gap-1.5"
                        style={{
                          paddingLeft: treeMode ? `${depth * 22}px` : 0,
                        }}
                      >
                        {treeMode && childCount > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapse(item.id);
                            }}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : treeMode ? (
                          <span className="w-4.5 shrink-0" />
                        ) : null}

                        <span className="font-medium text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {item.title}
                        </span>

                        {treeMode && childCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            <GitBranch className="h-2.5 w-2.5" />
                            {childCount}
                          </span>
                        )}

                        {item.labels.slice(0, 2).map((l) => (
                          <span
                            key={l}
                            className="hidden sm:inline-flex rounded px-1.5 py-0.5 text-[10.5px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td
                      className="py-2.5 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={item.statusId}
                        onChange={(e) =>
                          onUpdateItem(item.id, { statusId: e.target.value })
                        }
                        className="rounded-md border px-2 py-1 text-xs font-semibold bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                        style={{
                          borderColor: `${status?.color ?? "#64748b"}55`,
                          color: status?.color ?? "#64748b",
                          backgroundColor: `${status?.color ?? "#64748b"}12`,
                        }}
                      >
                        {statuses.map((s) => (
                          <option
                            key={s.id}
                            value={s.id}
                            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          >
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className="py-2.5 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <PriorityIcon priority={item.priority} />
                        <select
                          value={item.priority}
                          onChange={(e) =>
                            onUpdateItem(item.id, {
                              priority: e.target.value as Priority,
                            })
                          }
                          className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                        >
                          {PRIORITY_LIST.map((p) => (
                            <option
                              key={p}
                              value={p}
                              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            >
                              {PRIORITY_META[p].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-xs">
                      {item.dueDate ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            overdue
                              ? "text-red-600 dark:text-red-400 font-medium"
                              : "text-slate-500 dark:text-slate-400"
                          )}
                        >
                          <Calendar className="h-3 w-3" />
                          {formatShortDate(item.dueDate)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">
                          —
                        </span>
                      )}
                    </td>
                    {customFields.slice(0, 3).map((cf) => {
                      const val = item.customFields[cf.id];
                      let content: React.ReactNode = (
                        <span className="text-slate-300 dark:text-slate-700">
                          —
                        </span>
                      );
                      if (cf.fieldType === "select" && typeof val === "string") {
                        const opt = cf.options.find((o) => o.id === val);
                        if (opt) {
                          content = (
                            <span
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border"
                              style={{
                                backgroundColor: `${opt.color}18`,
                                borderColor: `${opt.color}40`,
                                color: opt.color,
                              }}
                            >
                              {opt.label}
                            </span>
                          );
                        }
                      } else if (cf.fieldType === "checkbox") {
                        content = val ? "Yes" : "No";
                      } else if (
                        val !== undefined &&
                        val !== null &&
                        val !== ""
                      ) {
                        content = (
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            {Array.isArray(val) ? val.join(", ") : String(val)}
                          </span>
                        );
                      }
                      return (
                        <td
                          key={cf.id}
                          className="py-2.5 px-3 whitespace-nowrap text-xs"
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6 + Math.min(customFields.length, 3)}
                    className="py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No {project.settings.defaultNounPlural.toLowerCase()} match
                    your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 bg-slate-50/60 dark:bg-[#1b1f2b]/60">
          <button
            type="button"
            onClick={onQuickCreate}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <Plus className="h-3.5 w-3.5" />
            New {project.settings.defaultNounSingular}
          </button>
        </div>
      </div>
    </div>
  );
}
