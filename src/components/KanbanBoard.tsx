"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, Plus, EyeOff, Check, X } from "lucide-react";
import type {
  CustomFieldDef,
  ItemType,
  Priority,
  ProjectBundle,
  StatusColumn,
  WorkItem,
} from "@/types";
import { DynamicIcon, PRIORITY_LIST, PRIORITY_META, PriorityIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";

interface SwimlaneDef {
  id: string;
  label: string;
  color?: string;
  icon?: string;
  priority?: Priority;
  patchOnDrop: (item: WorkItem) => Partial<WorkItem>;
  matches: (item: WorkItem) => boolean;
}

interface KanbanBoardProps {
  bundle: ProjectBundle;
  filteredItems: WorkItem[];
  visibleStatuses: StatusColumn[];
  swimlaneBy: string; // "none" | "priority" | "type" | "parent" | `cf:${id}`
  compact: boolean;
  onSelectItem: (item: WorkItem) => void;
  onQuickCreate: (defaults: {
    statusId: string;
    priority?: Priority;
    typeId?: string;
    parentId?: string | null;
    customFields?: Record<string, unknown>;
  }) => void;
  onMoveItem: (
    itemId: string,
    targetStatusId: string,
    targetIndex: number,
    extraPatch?: Partial<WorkItem>
  ) => Promise<void>;
  onAddColumn: (name: string, color: string) => Promise<void>;
  onRenameColumn: (statusId: string, name: string) => Promise<void>;
  onHideColumn?: (statusId: string) => void;
}

const CELL_SEP = "::";
const makeCellId = (laneId: string, statusId: string) =>
  `${laneId}${CELL_SEP}${statusId}`;

function DroppableCell({
  cellId,
  children,
  isOverLimit,
  onQuickAdd,
  addLabel,
}: {
  cellId: string;
  children: React.ReactNode;
  isOverLimit?: boolean;
  onQuickAdd: () => void;
  addLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 rounded-lg p-2 min-h-[110px] transition-colors border border-transparent",
        "bg-[#ebecf0]/85 dark:bg-[#161a24]",
        isOver &&
          "bg-blue-50/90 dark:bg-blue-950/35 border-blue-400/60 dark:border-blue-500/50",
        isOverLimit && "ring-1 ring-red-400/50"
      )}
    >
      {children}
      <button
        type="button"
        onClick={onQuickAdd}
        className="mt-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/80 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>{addLabel}</span>
      </button>
    </div>
  );
}

export function KanbanBoard({
  bundle,
  filteredItems,
  visibleStatuses,
  swimlaneBy,
  compact,
  onSelectItem,
  onQuickCreate,
  onMoveItem,
  onAddColumn,
  onRenameColumn,
  onHideColumn,
}: KanbanBoardProps) {
  const { project, itemTypes, customFields, items } = bundle;
  const statuses = visibleStatuses;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>(
    {}
  );
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColColor, setNewColColor] = useState("#6366f1");
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState("");

  // Persist collapsed swimlanes in localStorage per project + mode
  const storageKey = `keel:collapsed:${project.id}:${swimlaneBy}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setCollapsedLanes(saved ? JSON.parse(saved) : {});
    } catch {
      setCollapsedLanes({});
    }
  }, [storageKey]);

  const toggleLane = (laneId: string) => {
    setCollapsedLanes((prev) => {
      const next = { ...prev, [laneId]: !prev[laneId] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const typeMap = useMemo(
    () => new Map<string, ItemType>(itemTypes.map((t) => [t.id, t])),
    [itemTypes]
  );

  const itemMap = useMemo(
    () => new Map<string, WorkItem>(items.map((i) => [i.id, i])),
    [items]
  );

  const subitemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      if (i.parentId) {
        counts.set(i.parentId, (counts.get(i.parentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [items]);

  // Build swimlanes dynamically based on swimlaneBy
  const swimlanes: SwimlaneDef[] = useMemo(() => {
    if (swimlaneBy === "none") {
      return [
        {
          id: "all",
          label: "All",
          matches: () => true,
          patchOnDrop: () => ({}),
        },
      ];
    }

    if (swimlaneBy === "priority") {
      return PRIORITY_LIST.map((p) => ({
        id: `priority-${p}`,
        label: PRIORITY_META[p].label,
        color: PRIORITY_META[p].color,
        priority: p,
        matches: (item) => item.priority === p,
        patchOnDrop: () => ({ priority: p }),
      }));
    }

    if (swimlaneBy === "type") {
      return itemTypes.map((t) => ({
        id: `type-${t.id}`,
        label: t.pluralName,
        color: t.color,
        icon: t.icon,
        matches: (item) => item.typeId === t.id,
        patchOnDrop: () => ({ typeId: t.id }),
      }));
    }

    if (swimlaneBy === "parent") {
      // Find all items that have children
      const parentIds = new Set<string>();
      for (const i of items) {
        if (i.parentId) parentIds.add(i.parentId);
      }
      const parents = items.filter((i) => parentIds.has(i.id));
      const lanes: SwimlaneDef[] = parents.map((parent) => ({
        id: `parent-${parent.id}`,
        label: `${parent.key} · ${parent.title}`,
        color: typeMap.get(parent.typeId)?.color ?? "#64748b",
        icon: typeMap.get(parent.typeId)?.icon ?? "Flag",
        matches: (item) => item.parentId === parent.id,
        patchOnDrop: (dragged) =>
          dragged.id === parent.id ? {} : { parentId: parent.id },
      }));
      lanes.push({
        id: "parent-none",
        label: `Unassigned / Top-level ${project.settings.defaultNounPlural}`,
        color: "#64748b",
        matches: (item) => !item.parentId || !parentIds.has(item.parentId),
        patchOnDrop: () => ({ parentId: null }),
      });
      return lanes;
    }

    if (swimlaneBy.startsWith("cf:")) {
      const fieldId = swimlaneBy.slice(3);
      const cf: CustomFieldDef | undefined = customFields.find(
        (f) => f.id === fieldId
      );
      if (cf && cf.fieldType === "select") {
        const lanes: SwimlaneDef[] = cf.options.map((opt) => ({
          id: `cf-${cf.id}-${opt.id}`,
          label: opt.label,
          color: opt.color,
          matches: (item) => item.customFields[cf.id] === opt.id,
          patchOnDrop: (dragged) => ({
            customFields: { ...dragged.customFields, [cf.id]: opt.id },
          }),
        }));
        lanes.push({
          id: `cf-${cf.id}-unset`,
          label: `No ${cf.name}`,
          color: "#64748b",
          matches: (item) => !item.customFields[cf.id],
          patchOnDrop: (dragged) => {
            const next = { ...dragged.customFields };
            delete next[cf.id];
            return { customFields: next };
          },
        });
        return lanes;
      }
    }

    return [
      {
        id: "all",
        label: "All",
        matches: () => true,
        patchOnDrop: () => ({}),
      },
    ];
  }, [swimlaneBy, itemTypes, items, typeMap, customFields, project.settings.defaultNounPlural]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeItem = activeId ? itemMap.get(activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const draggedId = String(active.id);
    const overId = String(over.id);
    const draggedItem = itemMap.get(draggedId);
    if (!draggedItem) return;

    let targetStatusId: string | null = null;
    let targetLane: SwimlaneDef | undefined;
    let targetIndex = 0;

    if (overId.includes(CELL_SEP)) {
      // Dropped directly onto a cell container
      const [laneId, statusId] = overId.split(CELL_SEP);
      targetStatusId = statusId;
      targetLane = swimlanes.find((l) => l.id === laneId);
      const colItems = items.filter((i) => i.statusId === statusId);
      targetIndex = colItems.length;
    } else {
      // Dropped onto another card
      const overItem = itemMap.get(overId);
      if (!overItem) return;
      targetStatusId = overItem.statusId;
      targetLane = swimlanes.find((l) => l.matches(overItem));
      const colItems = items
        .filter((i) => i.statusId === targetStatusId)
        .sort((a, b) => a.position - b.position);
      const idx = colItems.findIndex((i) => i.id === overId);
      targetIndex = idx >= 0 ? idx : colItems.length;
    }

    if (!targetStatusId) return;

    const extraPatch = targetLane ? targetLane.patchOnDrop(draggedItem) : {};

    // Check if anything actually changed
    const sameStatus = draggedItem.statusId === targetStatusId;
    const sameCard = draggedId === overId;
    if (sameStatus && sameCard && Object.keys(extraPatch).length === 0) return;

    await onMoveItem(draggedId, targetStatusId, targetIndex, extraPatch);
  };

  const totalCountByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of statuses) map.set(s.id, 0);
    for (const i of filteredItems) {
      map.set(i.statusId, (map.get(i.statusId) ?? 0) + 1);
    }
    return map;
  }, [statuses, filteredItems]);

  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${statuses.length}, minmax(272px, 1fr)) 220px`,
  };

  const handleSubmitNewColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    await onAddColumn(newColName.trim(), newColColor);
    setNewColName("");
    setAddingColumn(false);
  };

  const commitRenameColumn = async (statusId: string) => {
    const trimmed = editingColName.trim();
    setEditingColId(null);
    if (trimmed) {
      await onRenameColumn(statusId, trimmed);
    }
  };

  const getQuickCreateDefaults = (lane: SwimlaneDef, status: StatusColumn) => {
    const dummy = {
      customFields: {},
    } as WorkItem;
    const patch = lane.patchOnDrop(dummy);
    return {
      statusId: status.id,
      priority: patch.priority,
      typeId: patch.typeId,
      parentId: patch.parentId,
      customFields: patch.customFields,
    };
  };

  return (
    <DndContext
      id={`kanban-dnd-${project.id}`}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-auto px-5 pb-8 pt-3">
        <div className="min-w-max">
          {/* Sticky Column Headers */}
          <div
            className="sticky top-0 z-10 grid gap-3 pb-2.5 bg-[#f4f5f7] dark:bg-[#0f1117]"
            style={gridStyle}
          >
            {statuses.map((status) => {
              const colCount = totalCountByStatus.get(status.id) ?? 0;
              const overWip =
                status.wipLimit !== null && colCount > status.wipLimit;

              return (
                <div
                  key={status.id}
                  className={cn(
                    "group/col flex items-center justify-between rounded-lg px-3 py-2 border",
                    "bg-[#ebecf0] dark:bg-[#1a1f2c] border-slate-200/80 dark:border-slate-800",
                    overWip && "border-red-400/70 bg-red-50/70 dark:bg-red-950/30"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    {editingColId === status.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingColName}
                        onChange={(e) => setEditingColName(e.target.value)}
                        onBlur={() => commitRenameColumn(status.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRenameColumn(status.id);
                          if (e.key === "Escape") setEditingColId(null);
                        }}
                        className="w-full rounded border border-blue-500 bg-white dark:bg-[#11141d] px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => {
                          setEditingColId(status.id);
                          setEditingColName(status.name);
                        }}
                        title="Double-click to rename column"
                        className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate cursor-text"
                      >
                        {status.name}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[11px] font-semibold shrink-0",
                        overWip
                          ? "bg-red-500 text-white"
                          : "bg-slate-300/60 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300"
                      )}
                    >
                      {colCount}
                      {status.wipLimit !== null ? ` / ${status.wipLimit}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {onHideColumn && statuses.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onHideColumn(status.id)}
                        title={`Hide "${status.name}" on this board`}
                        className="opacity-0 group-hover/col:opacity-100 rounded p-1 text-slate-400 hover:bg-slate-300/60 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-100 transition-all"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onQuickCreate({ statusId: status.id })}
                      title={`Add ${project.settings.defaultNounSingular} to ${status.name}`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-300/60 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Inline + Add Column control */}
            {addingColumn ? (
              <form
                onSubmit={handleSubmitNewColumn}
                className="flex items-center gap-1.5 rounded-lg border border-blue-400/70 bg-white dark:bg-[#1a1f2c] px-2 py-1.5"
              >
                <input
                  type="color"
                  value={newColColor}
                  onChange={(e) => setNewColColor(e.target.value)}
                  className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent shrink-0"
                />
                <input
                  type="text"
                  autoFocus
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="Column name..."
                  className="w-full min-w-0 bg-transparent text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingColumn(false);
                    setNewColName("");
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white/60 dark:hover:bg-[#1a1f2c]/60 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Column
              </button>
            )}
          </div>

          {/* Swimlanes */}
          <div className="flex flex-col gap-4">
            {swimlanes.map((lane) => {
              const laneItems = filteredItems.filter((item) =>
                lane.matches(item)
              );
              const isCollapsed = Boolean(collapsedLanes[lane.id]);
              const showHeader = swimlaneBy !== "none";

              return (
                <div key={lane.id} className="flex flex-col gap-2">
                  {showHeader && (
                    <button
                      type="button"
                      onClick={() => toggleLane(lane.id)}
                      className="flex items-center gap-2 self-start rounded-md px-2 py-1 text-left hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      )}
                      {lane.priority ? (
                        <PriorityIcon priority={lane.priority} className="h-3.5 w-3.5" />
                      ) : lane.icon ? (
                        <DynamicIcon
                          name={lane.icon}
                          className="h-3.5 w-3.5"
                          style={{ color: lane.color }}
                        />
                      ) : lane.color ? (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: lane.color }}
                        />
                      ) : null}
                      <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                        {lane.label}
                      </span>
                      <span className="rounded-full bg-slate-200/90 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        {laneItems.length}{" "}
                        {laneItems.length === 1
                          ? project.settings.defaultNounSingular.toLowerCase()
                          : project.settings.defaultNounPlural.toLowerCase()}
                      </span>
                    </button>
                  )}

                  {!isCollapsed && (
                    <div className="grid gap-3" style={gridStyle}>
                      {statuses.map((status) => {
                        const cellId = makeCellId(lane.id, status.id);
                        const cellItems = laneItems
                          .filter((i) => i.statusId === status.id)
                          .sort((a, b) => a.position - b.position);
                        const overWip =
                          status.wipLimit !== null &&
                          (totalCountByStatus.get(status.id) ?? 0) >
                            status.wipLimit;

                        return (
                          <SortableContext
                            key={cellId}
                            items={cellItems.map((i) => i.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <DroppableCell
                              cellId={cellId}
                              isOverLimit={overWip}
                              addLabel={`Add ${project.settings.defaultNounSingular}`}
                              onQuickAdd={() =>
                                onQuickCreate(
                                  getQuickCreateDefaults(lane, status)
                                )
                              }
                            >
                              {cellItems.map((item) => (
                                <KanbanCard
                                  key={item.id}
                                  item={item}
                                  itemType={typeMap.get(item.typeId)}
                                  parentItem={
                                    item.parentId
                                      ? itemMap.get(item.parentId)
                                      : undefined
                                  }
                                  subitemCount={subitemCounts.get(item.id) ?? 0}
                                  customFields={customFields}
                                  cardFields={project.settings.cardFields}
                                  compact={compact}
                                  onClick={() => onSelectItem(item)}
                                />
                              ))}
                            </DroppableCell>
                          </SortableContext>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="w-[272px]">
            <KanbanCard
              item={activeItem}
              itemType={typeMap.get(activeItem.typeId)}
              parentItem={
                activeItem.parentId
                  ? itemMap.get(activeItem.parentId)
                  : undefined
              }
              subitemCount={subitemCounts.get(activeItem.id) ?? 0}
              customFields={customFields}
              cardFields={project.settings.cardFields}
              compact={compact}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
