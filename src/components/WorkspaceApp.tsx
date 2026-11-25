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
  Settings,
  Shield,
  Filter,
} from "lucide-react";
import type {
  CustomSwimline,
  Priority,
  Project,
  ProjectBundle,
  ProjectView,
  QuickFilterDef,
  User,
  WorkItem,
} from "@/types";
import { DynamicIcon, PRIORITY_LIST, PRIORITY_META, PriorityIcon } from "@/lib/icons";
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
import { AccountSecurityModal } from "./AccountSecurityModal";
import { AdminConsoleView } from "./AdminConsoleView";
import { ToolbarMultiFilter, type FilterOption } from "./ToolbarMultiFilter";

interface WorkspaceAppProps {
  currentUser: User;
  initialProjects: Project[];
  initialBundle: ProjectBundle | null;
}

export function WorkspaceApp({
  currentUser,
  initialProjects,
  initialBundle,
}: WorkspaceAppProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    initialBundle?.project.id ?? initialProjects[0]?.id ?? ""
  );
  const [bundle, setBundle] = useState<ProjectBundle | null>(initialBundle);
  const [loadingProject, setLoadingProject] = useState(false);

  // Navigation: active ProjectView, project "settings", or master "admin" console
  const [mode, setMode] = useState<"view" | "settings" | "admin">("view");
  const [activeViewId, setActiveViewId] = useState<string>(
    initialBundle?.views[0]?.id ?? ""
  );
  const [showQueryBar, setShowQueryBar] = useState(false);

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
  const [customSwimlines, setCustomSwimlines] = useState<CustomSwimline[]>(
    initialView?.filters?.customSwimlines ?? []
  );
  const [quickFilters, setQuickFilters] = useState<QuickFilterDef[]>(
    initialView?.filters?.quickFilters ?? []
  );
  const [hiddenStatusIds, setHiddenStatusIds] = useState<string[]>(
    initialView?.hiddenStatusIds ?? []
  );
  const [compactCards, setCompactCards] = useState<boolean>(
    initialView?.compact ?? false
  );

  // Ad-hoc quick filters (layered on top of the view's JQL query)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTypeIds, setFilterTypeIds] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [fieldQuickFilterValues, setFieldQuickFilterValues] = useState<
    Record<string, string[]>
  >({});
  const [activeQueryFilterIds, setActiveQueryFilterIds] = useState<string[]>(
    []
  );
  const [showAddQuickFilter, setShowAddQuickFilter] = useState(false);
  const [newQfTab, setNewQfTab] = useState<"field" | "query">("field");
  const [newQfLabel, setNewQfLabel] = useState("");
  const [newQfQuery, setNewQfQuery] = useState("");
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);

  // Modals
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [createItemDefaults, setCreateItemDefaults] = useState<{
    statusId?: string;
    priority?: Priority;
    ownerId?: string | null;
    typeId?: string;
    parentId?: string | null;
    customFields?: Record<string, unknown>;
  } | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
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
    setCustomSwimlines(v.filters?.customSwimlines ?? []);
    setQuickFilters(v.filters?.quickFilters ?? []);
    setHiddenStatusIds(v.hiddenStatusIds ?? []);
    setCompactCards(Boolean(v.compact));
    setSearchQuery("");
    setFilterTypeIds([]);
    setFilterPriorities([]);
    setFieldQuickFilterValues({});
    setActiveQueryFilterIds([]);
    setShowAddQuickFilter(false);
    setShowColumnsMenu(false);
    setShowQueryBar(false);
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
      members: bundle.members,
      currentUserId: currentUser.id,
    });
  }, [bundle, jqlQuery, currentUser.id]);

  // Pre-compile active query-based quick filter pills
  const activeCompiledQuickQueries = useMemo(() => {
    if (!bundle || activeQueryFilterIds.length === 0) return [];
    const ctx = {
      itemTypes: bundle.itemTypes,
      statuses: bundle.statuses,
      customFields: bundle.customFields,
      allItems: bundle.items,
      members: bundle.members,
      currentUserId: currentUser.id,
    };
    return quickFilters
      .filter(
        (qf): qf is Extract<QuickFilterDef, { kind: "query" }> =>
          qf.kind === "query" && activeQueryFilterIds.includes(qf.id)
      )
      .map((qf) => compileQuery(qf.query, ctx));
  }, [bundle, quickFilters, activeQueryFilterIds, currentUser.id]);

  // Filtered items = JQL query + multi-select Types/Priorities + custom quick filters + quick search
  const filteredItems = useMemo(() => {
    if (!bundle) return [];
    const q = searchQuery.trim().toLowerCase();
    return bundle.items.filter((item) => {
      if (compiledQuery.ok && !compiledQuery.matches(item)) return false;
      if (filterTypeIds.length > 0 && !filterTypeIds.includes(item.typeId)) {
        return false;
      }
      if (
        filterPriorities.length > 0 &&
        !filterPriorities.includes(item.priority)
      ) {
        return false;
      }

      // Active query quick filter pills
      for (const compiled of activeCompiledQuickQueries) {
        if (compiled.ok && !compiled.matches(item)) return false;
      }

      // Active field quick filter dropdowns
      for (const qf of quickFilters) {
        if (qf.kind !== "field") continue;
        const selected = fieldQuickFilterValues[qf.id];
        if (!selected || selected.length === 0) continue;

        if (qf.fieldKey === "owner") {
          const itemOwnerKey = item.ownerId ?? "__unassigned__";
          if (!selected.includes(itemOwnerKey)) return false;
        } else if (qf.fieldKey === "labels") {
          const itemLabelsLower = new Set(
            item.labels.map((l) => l.toLowerCase())
          );
          if (!selected.some((sel) => itemLabelsLower.has(sel.toLowerCase()))) {
            return false;
          }
        } else if (qf.fieldKey.startsWith("cf:")) {
          const cfId = qf.fieldKey.slice(3);
          const cfDef = bundle.customFields.find((c) => c.id === cfId);
          const rawVal = item.customFields[cfId];
          if (cfDef?.fieldType === "multi_select") {
            const arr = Array.isArray(rawVal) ? (rawVal as string[]) : [];
            if (!selected.some((sel) => arr.includes(sel))) return false;
          } else if (cfDef?.fieldType === "checkbox") {
            const strVal = rawVal ? "true" : "false";
            if (!selected.includes(strVal)) return false;
          } else {
            const strVal =
              rawVal === undefined || rawVal === null || rawVal === ""
                ? "__empty__"
                : String(rawVal);
            if (!selected.includes(strVal)) return false;
          }
        }
      }

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
  }, [
    bundle,
    compiledQuery,
    searchQuery,
    filterTypeIds,
    filterPriorities,
    activeCompiledQuickQueries,
    quickFilters,
    fieldQuickFilterValues,
  ]);

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
    const sameCustomLanes =
      JSON.stringify(customSwimlines) ===
      JSON.stringify(activeView.filters?.customSwimlines ?? []);
    return (
      jqlQuery.trim() !== (activeView.query ?? "").trim() ||
      swimlaneBy !== (activeView.swimlaneBy ?? "none") ||
      compactCards !== Boolean(activeView.compact) ||
      !sameHidden ||
      !sameCustomLanes
    );
  }, [
    activeView,
    jqlQuery,
    swimlaneBy,
    customSwimlines,
    compactCards,
    hiddenStatusIds,
  ]);

  const handleSaveCurrentView = async () => {
    if (!bundle || !activeView || !compiledQuery.ok) return;
    const res = await fetch(
      `/api/projects/${bundle.project.id}/views/${activeView.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: jqlQuery.trim(),
          filters: {
            ...(activeView.filters ?? {}),
            customSwimlines,
            quickFilters,
          },
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

  const persistQuickFilters = async (nextQfs: QuickFilterDef[]) => {
    setQuickFilters(nextQfs);
    if (!bundle || !activeView) return;
    const res = await fetch(
      `/api/projects/${bundle.project.id}/views/${activeView.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            ...(activeView.filters ?? {}),
            customSwimlines,
            quickFilters: nextQfs,
          },
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

  const handleAddFieldQuickFilter = (
    fieldKey: "owner" | "labels" | `cf:${string}`,
    label: string
  ) => {
    if (quickFilters.some((q) => q.kind === "field" && q.fieldKey === fieldKey)) {
      setShowAddQuickFilter(false);
      return;
    }
    const next: QuickFilterDef = {
      id: `qf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: "field",
      label,
      fieldKey,
    };
    persistQuickFilters([...quickFilters, next]);
    setShowAddQuickFilter(false);
  };

  const handleAddQueryQuickFilter = (label: string, query: string) => {
    if (!label.trim() || !query.trim()) return;
    const next: QuickFilterDef = {
      id: `qf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: "query",
      label: label.trim(),
      query: query.trim(),
    };
    persistQuickFilters([...quickFilters, next]);
    setNewQfLabel("");
    setNewQfQuery("");
    setShowAddQuickFilter(false);
  };

  const handleRemoveQuickFilter = (qfId: string) => {
    setFieldQuickFilterValues((prev) => {
      const copy = { ...prev };
      delete copy[qfId];
      return copy;
    });
    setActiveQueryFilterIds((prev) => prev.filter((id) => id !== qfId));
    persistQuickFilters(quickFilters.filter((q) => q.id !== qfId));
  };

  const getFieldQuickFilterOptions = (
    fieldKey: "owner" | "labels" | `cf:${string}`
  ): FilterOption[] => {
    if (!bundle) return [];
    if (fieldKey === "owner") {
      return [
        ...(bundle.members ?? []).map((m) => ({
          id: m.userId,
          label: m.userId === currentUser.id ? `${m.name} (Me)` : m.name,
          color: "#3b82f6",
        })),
        { id: "__unassigned__", label: "Unassigned", color: "#94a3b8" },
      ];
    }
    if (fieldKey === "labels") {
      const map = new Map<string, string>();
      for (const i of bundle.items) {
        for (const l of i.labels) {
          const low = l.toLowerCase();
          if (!map.has(low)) map.set(low, l);
        }
      }
      return [...map.values()]
        .sort((a, b) => a.localeCompare(b))
        .map((l) => ({ id: l, label: l }));
    }
    if (fieldKey.startsWith("cf:")) {
      const cfId = fieldKey.slice(3);
      const cf = bundle.customFields.find((c) => c.id === cfId);
      if (!cf) return [];
      if (cf.fieldType === "select" || cf.fieldType === "multi_select") {
        return cf.options.map((o) => ({
          id: o.id,
          label: o.label,
          color: o.color,
        }));
      }
      if (cf.fieldType === "checkbox") {
        return [
          { id: "true", label: "Yes", color: "#10b981" },
          { id: "false", label: "No", color: "#94a3b8" },
        ];
      }
      const uniqueVals = new Set<string>();
      for (const i of bundle.items) {
        const v = i.customFields[cfId];
        if (v !== undefined && v !== null && v !== "") {
          uniqueVals.add(String(v));
        }
      }
      return [...uniqueVals]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ id: v, label: v }));
    }
    return [];
  };

  // Item CRUD handlers
  const handleCreateItem = async (payload: {
    title: string;
    description: string;
    typeId: string;
    statusId: string;
    priority: Priority;
    ownerId: string | null;
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
      ownerId: currentUser.id,
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
            ownerId: extraPatch.ownerId,
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
    filterTypeIds.length > 0 ||
    filterPriorities.length > 0 ||
    activeQueryFilterIds.length > 0 ||
    Object.values(fieldQuickFilterValues).some((arr) => arr.length > 0);

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
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-0.5">
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

        {/* Master Admin Console link (always visible for Master Admins, even with 0 projects) */}
        {currentUser.isMasterAdmin && (
          <div className={cn("px-3 pb-2", !bundle && "pt-3 flex-1")}>
            <button
              type="button"
              onClick={() => setMode("admin")}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                mode === "admin"
                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
              )}
            >
              <Shield className="h-4 w-4 text-amber-500" />
              Master Admin
            </button>
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
            {mode === "admin" ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                  <Shield className="h-3.5 w-3.5" />
                </span>
                <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  Master Admin Console
                </h1>
              </div>
            ) : bundle ? (
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
                {mode === "view" && activeView && (
                  <button
                    type="button"
                    onClick={() => setShowQueryBar((prev) => !prev)}
                    title={
                      showQueryBar
                        ? "Hide board query & view settings"
                        : "Show board query & view settings"
                    }
                    className={cn(
                      "relative rounded-md p-1 transition-colors",
                      showQueryBar
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400"
                        : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                    )}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    {(jqlQuery.trim() !== "" || isViewDirty) && (
                      <span
                        className={cn(
                          "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
                          isViewDirty ? "bg-amber-500" : "bg-blue-500"
                        )}
                      />
                    )}
                  </button>
                )}
              </div>
            ) : null}
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

            <button
              type="button"
              onClick={() => setShowAccountModal(true)}
              title="Account, Passkeys & Security"
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#1a1f2c] pl-1.5 pr-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-400 transition-colors"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {currentUser.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:inline max-w-[100px] truncate">
                {currentUser.name}
              </span>
            </button>
          </div>
        </header>

        {/* View Toolbar: Collapsible JQL Query Bar (via gear icon) + Quick Filters + Swimlanes + Columns */}
        {bundle && mode === "view" && activeView && (
          <div className="border-b border-slate-200/80 dark:border-slate-800 bg-white/75 dark:bg-[#131620]/75 shrink-0">
            {/* Row 1: JQL-style Query Bar + Save View actions (revealed by gear icon next to board name) */}
            {showQueryBar && (
              <div className="flex flex-wrap items-center gap-2 px-5 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-800/80">
                <div className="relative flex-1 min-w-[260px]">
                  <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-500" />
                  <input
                    type="text"
                    autoFocus
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
            )}

            {/* Row 2: Quick Filters + Swimlanes + Columns + Density */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
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

                <ToolbarMultiFilter
                  label="Types"
                  allLabel="All Types"
                  selected={filterTypeIds}
                  onChange={setFilterTypeIds}
                  options={bundle.itemTypes.map((t) => ({
                    id: t.id,
                    label: t.pluralName,
                    icon: (
                      <DynamicIcon
                        name={t.icon}
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: t.color }}
                      />
                    ),
                  }))}
                />

                <ToolbarMultiFilter
                  label="Priorities"
                  allLabel="All Priorities"
                  selected={filterPriorities}
                  onChange={setFilterPriorities}
                  options={PRIORITY_LIST.map((p) => ({
                    id: p,
                    label: PRIORITY_META[p].label,
                    icon: <PriorityIcon priority={p} className="h-3.5 w-3.5 shrink-0" />,
                  }))}
                />

                {/* User-added Quick Filters */}
                {quickFilters.map((qf) =>
                  qf.kind === "field" ? (
                    <ToolbarMultiFilter
                      key={qf.id}
                      label={qf.label}
                      allLabel={`All ${qf.label}`}
                      options={getFieldQuickFilterOptions(qf.fieldKey)}
                      selected={fieldQuickFilterValues[qf.id] ?? []}
                      onChange={(next) =>
                        setFieldQuickFilterValues((prev) => ({
                          ...prev,
                          [qf.id]: next,
                        }))
                      }
                      removable
                      onRemove={() => handleRemoveQuickFilter(qf.id)}
                    />
                  ) : (
                    <div
                      key={qf.id}
                      className={cn(
                        "inline-flex items-center rounded-md border text-xs font-medium transition-colors",
                        activeQueryFilterIds.includes(qf.id)
                          ? "border-blue-500/70 bg-blue-600 text-white"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] text-slate-700 dark:text-slate-200 hover:border-blue-400"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveQueryFilterIds((prev) =>
                            prev.includes(qf.id)
                              ? prev.filter((id) => id !== qf.id)
                              : [...prev, qf.id]
                          )
                        }
                        title={qf.query}
                        className="px-2.5 py-1 focus:outline-none"
                      >
                        {qf.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuickFilter(qf.id)}
                        title={`Remove "${qf.label}" quick filter`}
                        className={cn(
                          "pr-1.5 pl-0.5 py-1",
                          activeQueryFilterIds.includes(qf.id)
                            ? "text-blue-100 hover:text-white"
                            : "text-slate-400 hover:text-red-500"
                        )}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                )}

                {/* + Quick Filter Creator */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAddQuickFilter((o) => !o)}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <Filter className="h-3 w-3" />
                    <span>+ Quick Filter</span>
                  </button>

                  {showAddQuickFilter && (
                    <div
                      className="absolute left-0 top-full mt-1.5 z-40 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-2xl p-3 space-y-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#11141d] p-0.5 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setNewQfTab("field")}
                          className={cn(
                            "rounded-md py-1 transition-colors",
                            newQfTab === "field"
                              ? "bg-white dark:bg-[#1a1f2c] text-slate-900 dark:text-white shadow-xs"
                              : "text-slate-500"
                          )}
                        >
                          Field Dropdown
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewQfTab("query")}
                          className={cn(
                            "rounded-md py-1 transition-colors",
                            newQfTab === "query"
                              ? "bg-white dark:bg-[#1a1f2c] text-slate-900 dark:text-white shadow-xs"
                              : "text-slate-500"
                          )}
                        >
                          Toggle Pill
                        </button>
                      </div>

                      {newQfTab === "field" ? (
                        <div className="space-y-1 max-h-52 overflow-y-auto">
                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-1">
                            Add dropdown filter to bar
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddFieldQuickFilter("owner", "Owners")
                            }
                            className="w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          >
                            <span>Owner (User)</span>
                            <Plus className="h-3.5 w-3.5 text-blue-500" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAddFieldQuickFilter("labels", "Labels")
                            }
                            className="w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          >
                            <span>Labels</span>
                            <Plus className="h-3.5 w-3.5 text-blue-500" />
                          </button>
                          {bundle.customFields.map((cf) => (
                            <button
                              key={cf.id}
                              type="button"
                              onClick={() =>
                                handleAddFieldQuickFilter(
                                  `cf:${cf.id}`,
                                  cf.name
                                )
                              }
                              className="w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                            >
                              <span className="truncate">{cf.name}</span>
                              <Plus className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleAddQueryQuickFilter(
                                  "Only Mine",
                                  "owner = me"
                                )
                              }
                              className="rounded bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10.5px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                            >
                              + Only Mine
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAddQueryQuickFilter(
                                  "Unassigned",
                                  "owner is empty"
                                )
                              }
                              className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                            >
                              + Unassigned
                            </button>
                          </div>
                          <input
                            type="text"
                            value={newQfLabel}
                            onChange={(e) => setNewQfLabel(e.target.value)}
                            placeholder="Pill name (e.g. Urgent Bugs)"
                            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                          />
                          <input
                            type="text"
                            value={newQfQuery}
                            onChange={(e) => setNewQfQuery(e.target.value)}
                            placeholder="Query (e.g. priority = urgent)"
                            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 font-mono text-xs"
                          />
                          <button
                            type="button"
                            disabled={!newQfLabel.trim() || !newQfQuery.trim()}
                            onClick={() =>
                              handleAddQueryQuickFilter(newQfLabel, newQfQuery)
                            }
                            className="w-full rounded-md bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                          >
                            Add Quick Filter Pill
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterTypeIds([]);
                      setFilterPriorities([]);
                      setFieldQuickFilterValues({});
                      setActiveQueryFilterIds([]);
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

                  {/* Swimlines */}
                  <div className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1">
                    <Rows3 className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[11px] font-semibold text-slate-500">
                      Swimlines:
                    </span>
                    <select
                      value={swimlaneBy}
                      onChange={(e) => {
                        const next = e.target.value;
                        setSwimlaneBy(next);
                        if (
                          next === "custom" &&
                          customSwimlines.length === 0 &&
                          activeView
                        ) {
                          setViewModalState({
                            open: true,
                            editingView: activeView,
                            draftFromCurrent: true,
                          });
                        }
                      }}
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
                        value="owner"
                        className="bg-white dark:bg-slate-900"
                      >
                        Owner
                      </option>
                      <option
                        value="parent"
                        className="bg-white dark:bg-slate-900"
                      >
                        Parent Item
                      </option>
                      <option
                        value="custom"
                        className="bg-white dark:bg-slate-900"
                      >
                        Custom Queries
                        {customSwimlines.length > 0
                          ? ` (${customSwimlines.length})`
                          : ""}
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
                    {swimlaneBy === "custom" && activeView && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewModalState({
                            open: true,
                            editingView: activeView,
                            draftFromCurrent: true,
                          })
                        }
                        title="Edit custom swimlines"
                        className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
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
            if (showAddQuickFilter) setShowAddQuickFilter(false);
          }}
        >
          {loadingProject && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 dark:bg-black/30 backdrop-blur-[1px]">
              <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold shadow-sm">
                Loading project...
              </div>
            </div>
          )}

          {mode === "admin" && currentUser.isMasterAdmin ? (
            <AdminConsoleView
              currentUser={currentUser}
              onProjectsChanged={async () => {
                const nextProjects = await fetchProjects();
                if (
                  activeProjectId &&
                  !nextProjects.some((p) => p.id === activeProjectId)
                ) {
                  if (nextProjects[0]) {
                    setActiveProjectId(nextProjects[0].id);
                    await fetchBundle(nextProjects[0].id, true);
                  } else {
                    setActiveProjectId("");
                    setBundle(null);
                  }
                } else if (!activeProjectId && nextProjects[0]) {
                  setActiveProjectId(nextProjects[0].id);
                  await fetchBundle(nextProjects[0].id, true);
                }
              }}
            />
          ) : bundle ? (
            mode === "settings" ? (
              <ProjectSettingsView
                key={bundle.project.id}
                bundle={bundle}
                canDeleteProject={bundle.myRole === "owner"}
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
                customSwimlines={customSwimlines}
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
          currentUserId={currentUser.id}
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
                  customSwimlines,
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

      {showAccountModal && (
        <AccountSecurityModal
          user={currentUser}
          onClose={() => setShowAccountModal(false)}
        />
      )}
    </div>
  );
}
