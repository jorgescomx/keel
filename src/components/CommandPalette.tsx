"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search, Plus, Columns3, List, Settings2 } from "lucide-react";
import type { Project, ProjectBundle, WorkItem } from "@/types";
import { DynamicIcon } from "@/lib/icons";

interface CommandPaletteProps {
  projects: Project[];
  bundle: ProjectBundle | null;
  onClose: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectView: (viewId: string) => void;
  onSelectItem: (item: WorkItem) => void;
  onOpenSettings: () => void;
  onCreateItem: () => void;
}

export function CommandPalette({
  projects,
  bundle,
  onClose,
  onSelectProject,
  onSelectView,
  onSelectItem,
  onOpenSettings,
  onCreateItem,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();

  const matchedItems = useMemo(() => {
    if (!bundle) return [];
    return bundle.items
      .filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.key.toLowerCase().includes(q) ||
          i.labels.some((l) => l.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [bundle, q]);

  const matchedProjects = useMemo(
    () =>
      projects.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q)
      ),
    [projects, q]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-[2px] pt-[12vh] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items, projects, or actions..."
            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
          {/* Quick Actions */}
          <div>
            <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              Actions
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateItem();
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              Create new{" "}
              {bundle?.project.settings.defaultNounSingular.toLowerCase() ??
                "item"}
            </button>
            {bundle?.views.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  onSelectView(v.id);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {v.layout === "list" ? (
                  <List className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Columns3 className="h-3.5 w-3.5 text-blue-500" />
                )}
                <span>View: {v.name}</span>
                {v.query && (
                  <span className="ml-auto font-mono text-[10px] text-slate-400 truncate max-w-[180px]">
                    {v.query}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Settings2 className="h-3.5 w-3.5 text-slate-400" />
              Customize Project & Flow
            </button>
          </div>

          {/* Items */}
          {matchedItems.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                {bundle?.project.settings.defaultNounPlural ?? "Items"}
              </div>
              {matchedItems.map((item) => {
                const t = bundle?.itemTypes.find((x) => x.id === item.typeId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectItem(item);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {t && (
                      <DynamicIcon
                        name={t.icon}
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: t.color }}
                      />
                    )}
                    <span className="font-mono font-semibold text-slate-500 shrink-0">
                      {item.key}
                    </span>
                    <span className="truncate text-slate-800 dark:text-slate-100 font-medium">
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Projects */}
          {matchedProjects.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                Projects
              </div>
              {matchedProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(p.id);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-white shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    <DynamicIcon name={p.icon} className="h-3 w-3" />
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {p.name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {p.key}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
