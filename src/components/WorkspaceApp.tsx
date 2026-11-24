"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Columns3,
  List,
  Settings2,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Rows3,
  SlidersHorizontal,
  X,
  Pencil,
  Save,
  CopyPlus,
  Sparkles,
  AlertCircle,
  Eye,
} from "lucide-react";
import type {
  Priority,
  Project,
  ProjectBundle,
  ProjectView,
  WorkItem,
} from "@/types";
import { DynamicIcon, PRIORITY_LIST, PRIORITY_META } from "@/lib/icons";
import { getDefaultChildTypeId } from "@/lib/hierarchy";
import { compileQuery } from "@/lib/query";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "./KanbanBoard";
import { ListView } from "./ListView";
import { ProjectSettingsView } from "./ProjectSettingsView";
import { ItemDetailModal } from "./ItemDetailModal";
import { CreateItemModal } from "./CreateItemModal";
import { CreateProjectModal } from "./CreateProjectModal";
import { CommandPalette } from "./CommandPalette";
import { ViewEditorModal } from "./ViewEditorModal";

interface WorkspaceAppProps {
  initialProjects: Project[];
  initialBundle: ProjectBundle | null;
}

export function WorkspaceApp({
  initialProjects,
  initialBundle,
}: WorkspaceAppProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    initialBundle?.project.id ?? initialProjects[0]?.id ?? ""
  );
  const [bundle, setBundle] = useState<ProjectBundle | null>(initialBundle);
  const [loadingProject, setLoadingProject] = useState(false);

  // Navigation: either an active ProjectView or "settings"
  const [mode, setMode] = useState<"view" | "settings">("view");
  const [activeViewId, setActiveViewId] = useState<string>(
    initialBundle?.views[0]?.id ?? ""
  );

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Live working state synced from activeView (editable on the fly, saveable to view)
  const initialView = initialBundle?.views[0] ?? null;
  const [jqlQuery, setJqlQuery] = useState(initialView?.query ?? "");
  const [swimlaneBy, setSwimlaneBy] = useState<string>(
    initialView?.swimlaneBy ??
      initialBundle?.project.settings.defaultSwimlane ??
      "none"
  );
  const [hiddenStatusIds, setHiddenStatusIds] = useState<string[]>(
    initialView?.hiddenStatusIds ?? []
  );
  const [compactCards, setCompactCards] = useState<boolean>(
    initialView?.compact ?? false
  );

  // Ad-hoc quick filters (layered on top of the view's JQL query)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTypeId, setFilterTypeId] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);

  // Modals
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [createItemDefaults, setCreateItemDefaults] = useState<{
    statusId?: string;
    priority?: Priority;
    typeId?: string;
    parentId?: string | null;
    customFields?: Record<string, unknown>;
  } | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [viewModalState, setViewModalState] = useState<{
    open: boolean;
    editingView: ProjectView | null;
    draftFromCurrent?: boolean;
  }>({ open: false, editingView: null });

  const activeView = useMemo(() => {
    if (!bundle) return null;
    return (
      bundle.views.find((v) => v.id === activeViewId) ?? bundle.views[0] ?? null
    );
  }, [bundle, activeViewId]);

  const applyViewState = useCallback((v: ProjectView | null) => {
    if (!v) return;
    setActiveViewId(v.id);
    setMode("view");
    setJqlQuery(v.query ?? "");
    setSwimlaneBy(v.swimlaneBy ?? "none");
    setHiddenStatusIds(v.hiddenStatusIds ?? []);
    setCompactCards(Boolean(v.compact));
    setSearchQuery("");
    setFilterTypeId("all");
    setFilterPriority("all");
    setShowColumnsMenu(false);
  }, []);

  // Initialize theme
  useEffect(() => {
    try {
      const saved = localStorage.getItem("keel:theme");
      const isDark =
        saved === "dark" ||
        (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
      setDarkMode(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("keel:theme", next ? "dark" : "light");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data: Project[] = await res.json();
      setProjects(data);
      return data;
    }
    return [];
  }, []);

  const fetchBundle = useCallback(
    async (projectId: string, resetToFirstView = false) => {
      if (!projectId) return;
      setLoadingProject(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data: ProjectBundle = await res.json();
          setBundle(data);
          if (resetToFirstView && data.views.length > 0) {
            applyViewState(data.views[0]);
          }
        }
      } finally {
        setLoadingProject(false);
      }
    },
    [applyViewState]
  );

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    setSelectedItemId(null);
    await fetchBundle(projectId, true);
  };

  const handleRefreshAll = async () => {
    await fetchProjects();
    if (activeProjectId) {
      await fetchBundle(activeProjectId, false);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((prev) => !prev);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (
        !isInput &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "c" &&
        !selectedItemId &&
        !createItemDefaults &&
        !showCreateProject &&
        !showPalette &&
        !viewModalState.open
      ) {
        e.preventDefault();
        setCreateItemDefaults({});
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedItemId,
    createItemDefaults,
    showCreateProject,
    showPalette,
    viewModalState.open,
  ]);

  // Compile JQL query
  const compiledQuery = useMemo(() => {
    if (!bundle) return { ok: true as const, matches: () => true };
    return compileQuery(jqlQuery, {
      itemTypes: bundle.itemTypes,
      statuses: bundle.statuses,
      customFields: bundle.customFields,
      allItems: bundle.items,
    });
  }, [bundle, jqlQuery]);

  // Filtered items = JQL query + ad-hoc quick filters
  const filteredItems = useMemo(() => {
    if (!bundle) return [];
    const q = searchQuery.trim().toLowerCase();
    return bundle.items.filter((item) => {
      if (compiledQuery.ok && !compiledQuery.matches(item)) return false;
      if (filterTypeId !== "all" && item.typeId !== filterTypeId) return false;
      if (filterPriority !== "all" && item.priority !== filterPriority)
        return false;
      if (q) {
        const hit =
          item.title.toLowerCase().includes(q) ||
          item.key.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.labels.some((l) => l.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [bundle, compiledQuery, searchQuery, filterTypeId, filterPriority]);

  const visibleStatuses = useMemo(() => {
    if (!bundle) return [];
    const visible = bundle.statuses.filter(
      (s) => !hiddenStatusIds.includes(s.id)
    );
    return visible.length > 0 ? visible : bundle.statuses;
  }, [bundle, hiddenStatusIds]);

  // Detect unsaved changes vs activeView
  const isViewDirty = useMemo(() => {
    if (!activeView) return false;
    const sameHidden =
      JSON.stringify([...hiddenStatusIds].sort()) ===
      JSON.stringify([...(activeView.hiddenStatusIds ?? [])].sort());
    return (
      jqlQuery.trim() !== (activeView.query ?? "").trim() ||
      swimlaneBy !== (activeView.swimlaneBy ?? "none") ||
      compactCards !== Boolean(activeView.compact) ||
      !sameHidden
    );
  }, [activeView, jqlQuery, swimlaneBy, compactCards, hiddenStatusIds]);

  const handleSaveCurrentView = async () => {
    if (!bundle || !activeView || !compiledQuery.ok) return;
    const res = await fetch(
      `/api/projects/${bundle.project.id}/views/${activeView.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: jqlQuery.trim(),
          swimlaneBy,
          hiddenStatusIds,
          compact: compactCards,
        }),
      }
    );
    if (res.ok) {
      const updated: ProjectView = await res.json();
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              views: prev.views.map((v) => (v.id === updated.id ? updated : v)),
            }
          : prev
      );
    }
  };

  const toggleColumnVisibility = (statusId: string) => {
    if (!bundle) return;
    setHiddenStatusIds((prev) => {
      if (prev.includes(statusId)) {
        return prev.filter((id) => id !== statusId);
      }
      if (bundle.statuses.length - prev.length <= 1) return prev;
      return [...prev, statusId];
    });
  };

  // Inline board column actions
  const handleAddColumnInline = async (name: string, color: string) => {
    if (!bundle) return;
    const res = await fetch(`/api/projects/${bundle.project.id}/statuses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, category: "in_progress" }),
    });
    if (res.ok) {
      await fetchBundle(bundle.project.id, false);
    }
  };

  const handleRenameColumnInline = async (statusId: string, name: string) => {
    if (!bundle) return;
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            statuses: prev.statuses.map((s) =>
              s.id === statusId ? { ...s, name } : s
            ),
          }
        : prev
    );
    await fetch(`/api/projects/${bundle.project.id}/statuses/${statusId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  };

  const selectedItem = useMemo(() => {
    if (!bundle || !selectedItemId) return null;
    return bundle.items.find((i) => i.id === selectedItemId) ?? null;
  }, [bundle, selectedItemId]);

  const selectCustomFields = useMemo(
    () =>
      bundle?.customFields.filter((cf) => cf.fieldType === "select") ?? [],
    [bundle]
  );

  // Item CRUD handlers
  const handleCreateItem = async (payload: {
    title: string;
    description: string;
    typeId: string;
    statusId: string;
    priority: Priority;
    parentId: string | null;
    labels: string[];
    dueDate: string | null;
    customFields: Record<string, unknown>;
  }) => {
    if (!bundle) return;
    const res = await fetch(`/api/projects/${bundle.project.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created: WorkItem = await res.json();
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              project: {
                ...prev.project,
                itemCounter: Math.max(prev.project.itemCounter, created.number),
              },
              items: [...prev.items, created],
            }
          : prev
      );
    }
  };

  const handleUpdateItem = async (
    itemId: string,
    patch: Partial<WorkItem>
  ) => {
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) =>
              i.id === itemId ? { ...i, ...patch } : i
            ),
          }
        : prev
    );

    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: WorkItem = await res.json();
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) => (i.id === itemId ? updated : i)),
            }
          : prev
      );
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    setSelectedItemId(null);
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items
              .filter((i) => i.id !== itemId)
              .map((i) =>
                i.parentId === itemId ? { ...i, parentId: null } : i
              ),
          }
        : prev
    );
    await fetch(`/api/items/${itemId}`, { method: "DELETE" });
  };

  const handleCreateSubitem = async (parent: WorkItem, title: string) => {
    if (!bundle) return;
    const defaultType = getDefaultChildTypeId(parent.typeId, bundle.itemTypes);
    const defaultStatus = bundle.statuses[0]?.id;
    if (!defaultType || !defaultStatus) return;

    await handleCreateItem({
      title,
      description: "",
      typeId: defaultType,
      statusId: defaultStatus,
      priority: "medium",
      parentId: parent.id,
      labels: [],
      dueDate: null,
      customFields: {},
    });
  };

  const handleMoveItem = async (
    itemId: string,
    targetStatusId: string,
    targetIndex: number,
    extraPatch?: Partial<WorkItem>
  ) => {
    if (!bundle) return;

    const currentItems = [...bundle.items];
    const moving = currentItems.find((i) => i.id === itemId);
    if (!moving) return;

    const updatedMoving: WorkItem = {
      ...moving,
      ...(extraPatch ?? {}),
      statusId: targetStatusId,
    };

    const targetCol = currentItems
      .filter((i) => i.id !== itemId && i.statusId === targetStatusId)
      .sort((a, b) => a.position - b.position);

    const clampedIdx = Math.max(0, Math.min(targetIndex, targetCol.length));
    targetCol.splice(clampedIdx, 0, updatedMoving);

    const updates = targetCol.map((item, idx) => ({
      id: item.id,
      statusId: targetStatusId,
      position: idx,
      ...(item.id === itemId && extraPatch
        ? {
            priority: extraPatch.priority,
            typeId: extraPatch.typeId,
            parentId: extraPatch.parentId,
            customFields: extraPatch.customFields,
          }
        : {}),
    }));

    const posMap = new Map(updates.map((u) => [u.id, u.position]));

    setBundle((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => {
              if (i.id === itemId) {
                return {
                  ...updatedMoving,
                  position: posMap.get(i.id) ?? i.position,
                };
              }
              if (posMap.has(i.id)) {
                return { ...i, position: posMap.get(i.id)! };
              }
              return i;
            }),
          }
        : prev
    );

    await fetch("/api/items/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
  };

  const handleDeleteProject = async (projectId: string) => {
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    const nextProjects = await fetchProjects();
    if (nextProjects.length > 0) {
      await handleSelectProject(nextProjects[0].id);
    } else {
      setBundle(null);
      setActiveProjectId("");
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterTypeId !== "all" ||
    filterPriority !== "all";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f5f7] dark:bg-[#0f1117]">
      {/* Left Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131620] transition-all duration-200 shrink-0",
          sidebarOpen ? "w-62" : "w-0 overflow-hidden border-r-0"
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-4 h-13 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Keel
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            title="Collapse sidebar"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Projects List */}
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Projects
            </span>
            <button
              type="button"
              onClick={() => setShowCreateProject(true)}
              title="New project"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {projects.map((p) => {
              const active = p.id === activeProjectId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectProject(p.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors",
                    active
                      ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70"
                  )}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-white shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    <DynamicIcon name={p.icon} className="h-3 w-3" />
                  </span>
                  <span className="truncate flex-1">{p.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {p.key}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Project Views & Customization */}
        {bundle && (
          <div className="p-3 flex-1 overflow-y-auto space-y-4">
            {/* Saved Views / Custom Boards */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Views & Boards
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setViewModalState({
                      open: true,
                      editingView: null,
                      draftFromCurrent: false,
                    })
                  }
                  title="New custom board or list view"
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-0.5">
                {bundle.views.map((v) => {
                  const isActive = mode === "view" && activeView?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        "group flex items-center rounded-lg transition-colors",
                        isActive
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => applyViewState(v)}
                        className="flex-1 flex items-center gap-2 px-2.5 py-2 text-left text-xs font-medium min-w-0"
                      >
                        {v.layout === "list" ? (
                          <List className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Columns3 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "truncate",
                            isActive && "font-semibold"
                          )}
                        >
                          {v.name}
                        </span>
                        {v.query && (
                          <Sparkles
                            className="h-2.5 w-2.5 text-amber-500 shrink-0"
                            aria-label="Filtered view"
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewModalState({
                            open: true,
                            editingView: v,
                          });
                        }}
                        title={`Edit "${v.name}"`}
                        className="opacity-0 group-hover:opacity-100 mr-1.5 rounded p-1 text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Project Settings */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMode("settings")}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                  mode === "settings"
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                )}
              >
                <Settings2 className="h-4 w-4 text-violet-500" />
                Customize Project & Flow
              </button>
            </div>
          </div>
        )}

        {/* Footer hints */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>
            <kbd className="rounded border border-slate-200 dark:border-slate-700 px-1 py-0.5 font-mono text-[10px]">
              Ctrl+K
            </kbd>{" "}
            Jump
          </span>
          <span>
            <kbd className="rounded border border-slate-200 dark:border-slate-700 px-1 py-0.5 font-mono text-[10px]">
              C
            </kbd>{" "}
            Create
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between gap-3 h-13 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131620] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title="Expand sidebar"
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            {bundle && (
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white shrink-0"
                  style={{ backgroundColor: bundle.project.color }}
                >
                  <DynamicIcon
                    name={bundle.project.icon}
                    className="h-3.5 w-3.5"
                  />
                </span>
                <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {bundle.project.name}
                </h1>
                <span className="hidden sm:inline text-xs text-slate-400 truncate">
                  /{" "}
                  {mode === "settings"
                    ? "Customize Project & Flow"
                    : activeView?.name ?? "Board"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPalette(true)}
              className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#1a1f2c] px-3 py-1.5 text-xs text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Quick jump...</span>
              <kbd className="ml-2 rounded border border-slate-200 dark:border-slate-700 px-1 text-[10px] font-mono">
                Ctrl+K
              </kbd>
            </button>

            {bundle && (
              <button
                type="button"
                onClick={() => setCreateItemDefaults({})}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create {bundle.project.settings.defaultNounSingular}</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        {/* View Toolbar: JQL Query Bar + Quick Filters + Swimlanes + Columns */}
        {bundle && mode === "view" && activeView && (
          <div className="border-b border-slate-200/80 dark:border-slate-800 bg-white/75 dark:bg-[#131620]/75 shrink-0">
            {/* Row 1: JQL-style Query Bar + Save View actions */}
            <div className="flex flex-wrap items-center gap-2 px-5 pt-2.5 pb-2">
              <div className="relative flex-1 min-w-[260px]">
                <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-500" />
                <input
                  type="text"
                  value={jqlQuery}
                  onChange={(e) => setJqlQuery(e.target.value)}
                  placeholder='Query (JQL-style): e.g. priority in (urgent, high) AND status != Done  |  workstream = Frontend'
                  className={cn(
                    "w-full rounded-md border bg-white dark:bg-[#11141d] pl-8 pr-8 py-1.5 font-mono text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2",
                    jqlQuery.trim() && !compiledQuery.ok
                      ? "border-red-400 focus:ring-red-500/30"
                      : "border-slate-200 dark:border-slate-700 focus:ring-blue-500/40"
                  )}
                />
                {jqlQuery && (
                  <button
                    type="button"
                    onClick={() => setJqlQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {jqlQuery.trim() && !compiledQuery.ok && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {compiledQuery.error}
                </span>
              )}

              {isViewDirty && compiledQuery.ok && (
                <button
                  type="button"
                  onClick={handleSaveCurrentView}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save View
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setViewModalState({
                    open: true,
                    editingView: null,
                    draftFromCurrent: true,
                  })
                }
                title="Save current query & layout as a new view"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <CopyPlus className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Save as New</span>
              </button>
            </div>

            {/* Row 2: Quick Filters + Swimlanes + Columns + Density */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Quick search...`}
                    className="w-40 sm:w-48 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] pl-8 pr-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                <select
                  value={filterTypeId}
                  onChange={(e) => setFilterTypeId(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  {bundle.itemTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.pluralName}
                    </option>
                  ))}
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
                >
                  <option value="all">All Priorities</option>
                  {PRIORITY_LIST.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterTypeId("all");
                      setFilterPriority("all");
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                )}

                <span className="text-[11px] text-slate-400 pl-1">
                  {filteredItems.length} of {bundle.items.length}{" "}
                  {bundle.project.settings.defaultNounPlural.toLowerCase()}
                </span>
              </div>

              {activeView.layout === "board" && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Columns visibility popover */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowColumnsMenu((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        hiddenStatusIds.length > 0
                          ? "border-blue-500/50 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] text-slate-600 dark:text-slate-300"
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>
                        Columns ({visibleStatuses.length}/
                        {bundle.statuses.length})
                      </span>
                    </button>

                    {showColumnsMenu && (
                      <div className="absolute right-0 mt-1.5 z-30 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-xl p-2 space-y-1">
                        <div className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                          Visible on this board
                        </div>
                        {bundle.statuses.map((s) => {
                          const visible = !hiddenStatusIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={visible}
                                onChange={() => toggleColumnVisibility(s.id)}
                                className="h-3.5 w-3.5 rounded text-blue-600"
                              />
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: s.color }}
                              />
                              <span className="truncate text-slate-700 dark:text-slate-200">
                                {s.name}
                              </span>
                            </label>
                          );
                        })}
                        <div className="pt-1.5 mt-1 border-t border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setShowColumnsMenu(false);
                              setMode("settings");
                            }}
                            className="w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          >
                            Edit workflow & WIP limits →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Swimlanes */}
                  <div className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1">
                    <Rows3 className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[11px] font-semibold text-slate-500">
                      Swimlanes:
                    </span>
                    <select
                      value={swimlaneBy}
                      onChange={(e) => setSwimlaneBy(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                    >
                      <option
                        value="none"
                        className="bg-white dark:bg-slate-900"
                      >
                        None
                      </option>
                      <option
                        value="priority"
                        className="bg-white dark:bg-slate-900"
                      >
                        Priority
                      </option>
                      <option
                        value="type"
                        className="bg-white dark:bg-slate-900"
                      >
                        Item Type
                      </option>
                      <option
                        value="parent"
                        className="bg-white dark:bg-slate-900"
                      >
                        Parent Item
                      </option>
                      {selectCustomFields.map((cf) => (
                        <option
                          key={cf.id}
                          value={`cf:${cf.id}`}
                          className="bg-white dark:bg-slate-900"
                        >
                          {cf.name} (Custom)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Density */}
                  <button
                    type="button"
                    onClick={() => setCompactCards((c) => !c)}
                    title="Toggle card density"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      compactCards
                        ? "border-blue-500/50 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] text-slate-600 dark:text-slate-300"
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">
                      {compactCards ? "Compact" : "Comfortable"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active View Canvas */}
        <main
          className="flex-1 min-h-0 overflow-hidden relative"
          onClick={() => {
            if (showColumnsMenu) setShowColumnsMenu(false);
          }}
        >
          {loadingProject && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 dark:bg-black/30 backdrop-blur-[1px]">
              <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold shadow-sm">
                Loading project...
              </div>
            </div>
          )}

          {bundle ? (
            mode === "settings" ? (
              <ProjectSettingsView
                key={bundle.project.id}
                bundle={bundle}
                canDeleteProject={projects.length > 1}
                onRefresh={handleRefreshAll}
                onDeleteProject={handleDeleteProject}
              />
            ) : activeView?.layout === "list" ? (
              <ListView
                bundle={bundle}
                filteredItems={filteredItems}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onUpdateItem={handleUpdateItem}
                onQuickCreate={() => setCreateItemDefaults({})}
              />
            ) : (
              <KanbanBoard
                bundle={bundle}
                filteredItems={filteredItems}
                visibleStatuses={visibleStatuses}
                swimlaneBy={swimlaneBy}
                compact={compactCards}
                onSelectItem={(item) => setSelectedItemId(item.id)}
                onQuickCreate={(defaults) => setCreateItemDefaults(defaults)}
                onMoveItem={handleMoveItem}
                onAddColumn={handleAddColumnInline}
                onRenameColumn={handleRenameColumnInline}
                onHideColumn={toggleColumnVisibility}
              />
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
              <p className="text-sm text-slate-500">No projects yet.</p>
              <button
                type="button"
                onClick={() => setShowCreateProject(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Create Your First Project
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {bundle && selectedItem && (
        <ItemDetailModal
          bundle={bundle}
          item={selectedItem}
          onClose={() => setSelectedItemId(null)}
          onSelectItem={(item) => setSelectedItemId(item.id)}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onCreateSubitem={handleCreateSubitem}
        />
      )}

      {bundle && createItemDefaults !== null && (
        <CreateItemModal
          bundle={bundle}
          defaults={createItemDefaults}
          onClose={() => setCreateItemDefaults(null)}
          onCreate={handleCreateItem}
        />
      )}

      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={async (projectId) => {
            await fetchProjects();
            await handleSelectProject(projectId);
          }}
        />
      )}

      {bundle && viewModalState.open && (
        <ViewEditorModal
          bundle={bundle}
          editingView={viewModalState.editingView}
          initialDraft={
            viewModalState.draftFromCurrent
              ? {
                  layout: activeView?.layout ?? "board",
                  query: jqlQuery,
                  hiddenStatusIds,
                  swimlaneBy,
                  compact: compactCards,
                }
              : undefined
          }
          canDelete={bundle.views.length > 1}
          onClose={() =>
            setViewModalState({ open: false, editingView: null })
          }
          onSaved={async (savedView) => {
            setBundle((prev) => {
              if (!prev) return prev;
              const exists = prev.views.some((v) => v.id === savedView.id);
              return {
                ...prev,
                views: exists
                  ? prev.views.map((v) =>
                      v.id === savedView.id ? savedView : v
                    )
                  : [...prev.views, savedView],
              };
            });
            applyViewState(savedView);
          }}
          onDeleted={async (deletedId) => {
            const remaining = bundle.views.filter((v) => v.id !== deletedId);
            setBundle((prev) =>
              prev ? { ...prev, views: remaining } : prev
            );
            if (activeView?.id === deletedId && remaining[0]) {
              applyViewState(remaining[0]);
            }
          }}
        />
      )}

      {showPalette && (
        <CommandPalette
          projects={projects}
          bundle={bundle}
          onClose={() => setShowPalette(false)}
          onSelectProject={handleSelectProject}
          onSelectView={(viewId) => {
            const found = bundle?.views.find((v) => v.id === viewId);
            if (found) applyViewState(found);
          }}
          onSelectItem={(item) => setSelectedItemId(item.id)}
          onOpenSettings={() => setMode("settings")}
          onCreateItem={() => setCreateItemDefaults({})}
        />
      )}
    </div>
  );
}
