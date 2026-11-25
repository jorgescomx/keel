import {
  DEFAULT_PROJECT_SETTINGS,
  type CustomFieldDef,
  type ItemComment,
  type ItemType,
  type Priority,
  type Project,
  type ProjectSettings,
  type SelectOption,
  type StatusCategory,
  type StatusColumn,
  type WorkItem,
  type CustomFieldType,
  type ProjectView,
  type ViewFilters,
} from "@/types";
import { decryptString } from "@/lib/crypto";
import type {
  projects,
  itemTypes,
  statuses,
  customFields,
  items,
  comments,
  views,
} from "./schema";

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function serializeProject(row: typeof projects.$inferSelect): Project {
  const parsed = safeJsonParse<Partial<ProjectSettings>>(row.settings, {});
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    description: decryptString(row.description),
    icon: row.icon,
    color: row.color,
    itemCounter: row.itemCounter,
    settings: {
      ...DEFAULT_PROJECT_SETTINGS,
      ...parsed,
      cardFields: {
        ...DEFAULT_PROJECT_SETTINGS.cardFields,
        ...(parsed.cardFields ?? {}),
      },
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeItemType(row: typeof itemTypes.$inferSelect): ItemType {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    pluralName: row.pluralName,
    icon: row.icon,
    color: row.color,
    level: row.level ?? 2,
    position: row.position,
  };
}

export function serializeStatus(row: typeof statuses.$inferSelect): StatusColumn {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    category: row.category as StatusCategory,
    color: row.color,
    position: row.position,
    wipLimit: row.wipLimit ?? null,
  };
}

export function serializeCustomField(
  row: typeof customFields.$inferSelect
): CustomFieldDef {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    fieldType: row.fieldType as CustomFieldType,
    options: safeJsonParse<SelectOption[]>(row.options, []),
    applicableTypeIds: safeJsonParse<string[]>(row.applicableTypeIds, []),
    showOnCard: Boolean(row.showOnCard),
    position: row.position,
  };
}

export function serializeItem(row: typeof items.$inferSelect): WorkItem {
  const decryptedCf = decryptString(row.customFields);
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    number: row.number,
    title: decryptString(row.title),
    description: decryptString(row.description),
    typeId: row.typeId,
    statusId: row.statusId,
    priority: row.priority as Priority,
    parentId: row.parentId ?? null,
    labels: safeJsonParse<string[]>(row.labels, []),
    dueDate: row.dueDate ?? null,
    customFields: safeJsonParse<Record<string, unknown>>(decryptedCf, {}),
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeComment(row: typeof comments.$inferSelect): ItemComment {
  return {
    id: row.id,
    itemId: row.itemId,
    author: row.author,
    body: decryptString(row.body),
    createdAt: row.createdAt,
  };
}

export function serializeView(row: typeof views.$inferSelect): ProjectView {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    layout: row.layout === "list" ? "list" : "board",
    query: decryptString(row.query ?? ""),
    filters: safeJsonParse<ViewFilters>(row.filters, {}),
    hiddenStatusIds: safeJsonParse<string[]>(row.hiddenStatusIds, []),
    swimlaneBy: row.swimlaneBy ?? "none",
    compact: Boolean(row.compact),
    position: row.position,
  };
}
