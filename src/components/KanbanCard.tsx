"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, GitBranch, CornerDownRight, Check } from "lucide-react";
import type {
  CustomFieldDef,
  ItemType,
  ProjectSettings,
  WorkItem,
} from "@/types";
import { DynamicIcon, PriorityIcon } from "@/lib/icons";
import { cn, formatShortDate, isOverdue } from "@/lib/utils";

interface KanbanCardProps {
  item: WorkItem;
  itemType?: ItemType;
  parentItem?: WorkItem;
  subitemCount: number;
  customFields: CustomFieldDef[];
  cardFields: ProjectSettings["cardFields"];
  compact?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
}

export function KanbanCard({
  item,
  itemType,
  parentItem,
  subitemCount,
  customFields,
  cardFields,
  compact = false,
  isOverlay = false,
  onClick,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { item },
    disabled: isOverlay,
  });

  const style: React.CSSProperties = isOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const visibleCustomFields = customFields.filter((cf) => {
    if (!cf.showOnCard) return false;
    if (
      cf.applicableTypeIds.length > 0 &&
      !cf.applicableTypeIds.includes(item.typeId)
    ) {
      return false;
    }
    const val = item.customFields[cf.id];
    if (val === undefined || val === null || val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });

  const overdue = isOverdue(item.dueDate);

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "group relative rounded-lg border bg-white dark:bg-[#1a1e2a] border-slate-200/90 dark:border-slate-700/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-blue-400/70 dark:hover:border-blue-500/60 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing select-none",
        compact ? "p-2.5" : "p-3",
        isDragging && "opacity-35 ring-2 ring-blue-500/40",
        isOverlay &&
          "shadow-xl ring-2 ring-blue-500/50 rotate-[1.2deg] cursor-grabbing opacity-95"
      )}
    >
      {/* Parent breadcrumb */}
      {cardFields.showParent && parentItem && (
        <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
          <CornerDownRight className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="truncate">{parentItem.title}</span>
        </div>
      )}

      {/* Title */}
      <p
        className={cn(
          "font-medium text-slate-800 dark:text-slate-100 leading-snug break-words",
          compact ? "text-[13px]" : "text-[13.5px]"
        )}
      >
        {item.title}
      </p>

      {/* Labels & Custom Fields */}
      {((cardFields.showLabels && item.labels.length > 0) ||
        visibleCustomFields.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {cardFields.showLabels &&
            item.labels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/70"
              >
                {label}
              </span>
            ))}

          {visibleCustomFields.map((cf) => {
            const val = item.customFields[cf.id];
            if (cf.fieldType === "select") {
              const opt = cf.options.find((o) => o.id === val);
              if (!opt) return null;
              return (
                <span
                  key={cf.id}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium border"
                  style={{
                    backgroundColor: `${opt.color}18`,
                    borderColor: `${opt.color}40`,
                    color: opt.color,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                  {opt.label}
                </span>
              );
            }
            if (cf.fieldType === "multi_select" && Array.isArray(val)) {
              return val.map((optId) => {
                const opt = cf.options.find((o) => o.id === optId);
                if (!opt) return null;
                return (
                  <span
                    key={`${cf.id}-${opt.id}`}
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium border"
                    style={{
                      backgroundColor: `${opt.color}18`,
                      borderColor: `${opt.color}40`,
                      color: opt.color,
                    }}
                  >
                    {opt.label}
                  </span>
                );
              });
            }
            if (cf.fieldType === "checkbox") {
              if (!val) return null;
              return (
                <span
                  key={cf.id}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                >
                  <Check className="h-2.5 w-2.5" />
                  {cf.name}
                </span>
              );
            }
            return (
              <span
                key={cf.id}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium bg-blue-500/8 dark:bg-blue-500/15 text-slate-600 dark:text-slate-300 border border-blue-500/15"
              >
                <span className="text-slate-400 dark:text-slate-400">
                  {cf.name}:
                </span>
                <span>{String(val)}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Footer row (Jira-style: type icon + key on left, metadata + priority on right) */}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11.5px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5 min-w-0">
          {cardFields.showType && itemType && (
            <span
              title={itemType.name}
              className="inline-flex h-4.5 w-4.5 items-center justify-center rounded"
              style={{
                backgroundColor: `${itemType.color}1a`,
                color: itemType.color,
              }}
            >
              <DynamicIcon name={itemType.icon} className="h-3 w-3" />
            </span>
          )}
          {cardFields.showKey && (
            <span className="font-mono text-[11px] font-semibold tracking-tight text-slate-500 dark:text-slate-400">
              {item.key}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {cardFields.showSubitemCount && subitemCount > 0 && (
            <span
              title={`${subitemCount} sub-item${subitemCount === 1 ? "" : "s"}`}
              className="inline-flex items-center gap-0.5 text-[11px] text-slate-500 dark:text-slate-400"
            >
              <GitBranch className="h-3 w-3" />
              {subitemCount}
            </span>
          )}

          {cardFields.showDueDate && item.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10.5px] font-medium",
                overdue
                  ? "bg-red-500/12 text-red-600 dark:text-red-400"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatShortDate(item.dueDate)}
            </span>
          )}

          {cardFields.showPriority && (
            <span title={`Priority: ${item.priority}`}>
              <PriorityIcon priority={item.priority} className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
