export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export type StatusCategory = "backlog" | "todo" | "in_progress" | "done";

export type CustomFieldType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "url";

export interface SelectOption {
  id: string;
  label: string;
  color: string;
}

export interface ProjectSettings {
  defaultNounSingular: string;
  defaultNounPlural: string;
  cardFields: {
    showKey: boolean;
    showType: boolean;
    showPriority: boolean;
    showLabels: boolean;
    showDueDate: boolean;
    showSubitemCount: boolean;
    showParent: boolean;
  };
  defaultSwimlane: string; // "none" | "priority" | "type" | "parent" | `cf:${fieldId}`
  enforceHierarchy: boolean;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  icon: string;
  color: string;
  itemCounter: number;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ItemType {
  id: string;
  projectId: string;
  name: string;
  pluralName: string;
  icon: string;
  color: string;
  level: number; // 1 = Top tier (e.g. Initiative), 2 = Feature, 3 = Task, 4 = Sub-task, 5 = Sub-sub-task
  position: number;
}

export interface StatusColumn {
  id: string;
  projectId: string;
  name: string;
  category: StatusCategory;
  color: string;
  position: number;
  wipLimit: number | null;
}

export interface CustomFieldDef {
  id: string;
  projectId: string;
  name: string;
  fieldType: CustomFieldType;
  options: SelectOption[];
  applicableTypeIds: string[]; // empty = all types
  showOnCard: boolean;
  position: number;
}

export interface WorkItem {
  id: string;
  projectId: string;
  key: string;
  number: number;
  title: string;
  description: string;
  typeId: string;
  statusId: string;
  priority: Priority;
  parentId: string | null;
  labels: string[];
  dueDate: string | null;
  customFields: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemComment {
  id: string;
  itemId: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ViewFilters {
  typeIds?: string[];
  priorities?: Priority[];
  labels?: string[];
}

export interface ProjectView {
  id: string;
  projectId: string;
  name: string;
  layout: "board" | "list";
  query: string;
  filters: ViewFilters;
  hiddenStatusIds: string[];
  swimlaneBy: string;
  compact: boolean;
  position: number;
}

export interface ProjectBundle {
  project: Project;
  itemTypes: ItemType[];
  statuses: StatusColumn[];
  customFields: CustomFieldDef[];
  views: ProjectView[];
  items: WorkItem[];
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  defaultNounSingular: "Item",
  defaultNounPlural: "Items",
  cardFields: {
    showKey: true,
    showType: true,
    showPriority: true,
    showLabels: true,
    showDueDate: true,
    showSubitemCount: true,
    showParent: true,
  },
  defaultSwimlane: "none",
  enforceHierarchy: false,
};
