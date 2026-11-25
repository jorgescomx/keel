import crypto from "node:crypto";
import { count } from "drizzle-orm";
import { db } from "./index";
import {
  projects,
  itemTypes,
  statuses,
  customFields,
  items,
  comments,
} from "./schema";
import { DEFAULT_PROJECT_SETTINGS } from "@/types";

const id = () => crypto.randomUUID();

export async function seedIfEmpty() {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(projects);

  if (existing > 0) return;

  const now = new Date().toISOString();

  // --- Project 1: Product Delivery (Work-style engineering board) ---
  const p1 = id();
  const p1Settings = {
    ...DEFAULT_PROJECT_SETTINGS,
    defaultNounSingular: "Deliverable",
    defaultNounPlural: "Deliverables",
    defaultSwimlane: "priority",
  };

  await db.insert(projects).values({
    id: p1,
    name: "Product Platform",
    key: "PLAT",
    description: "Core platform roadmap, features, and reliability work.",
    icon: "Layers",
    color: "#3b82f6",
    itemCounter: 8,
    settings: JSON.stringify(p1Settings),
    createdAt: now,
    updatedAt: now,
  });

  const t1Init = id();
  const t1Feat = id();
  const t1Task = id();
  const t1Bug = id();

  await db.insert(itemTypes).values([
    {
      id: t1Init,
      projectId: p1,
      name: "Initiative",
      pluralName: "Initiatives",
      icon: "Flag",
      color: "#8b5cf6",
      position: 0,
    },
    {
      id: t1Feat,
      projectId: p1,
      name: "Feature",
      pluralName: "Features",
      icon: "Sparkles",
      color: "#10b981",
      position: 1,
    },
    {
      id: t1Task,
      projectId: p1,
      name: "Task",
      pluralName: "Tasks",
      icon: "CheckSquare",
      color: "#3b82f6",
      position: 2,
    },
    {
      id: t1Bug,
      projectId: p1,
      name: "Defect",
      pluralName: "Defects",
      icon: "Bug",
      color: "#ef4444",
      position: 3,
    },
  ]);

  const s1Backlog = id();
  const s1Todo = id();
  const s1InProg = id();
  const s1Review = id();
  const s1Done = id();

  await db.insert(statuses).values([
    {
      id: s1Backlog,
      projectId: p1,
      name: "Backlog",
      category: "backlog",
      color: "#64748b",
      position: 0,
      wipLimit: null,
    },
    {
      id: s1Todo,
      projectId: p1,
      name: "Ready",
      category: "todo",
      color: "#3b82f6",
      position: 1,
      wipLimit: null,
    },
    {
      id: s1InProg,
      projectId: p1,
      name: "In Progress",
      category: "in_progress",
      color: "#f59e0b",
      position: 2,
      wipLimit: 3,
    },
    {
      id: s1Review,
      projectId: p1,
      name: "In Review",
      category: "in_progress",
      color: "#8b5cf6",
      position: 3,
      wipLimit: 2,
    },
    {
      id: s1Done,
      projectId: p1,
      name: "Done",
      category: "done",
      color: "#10b981",
      position: 4,
      wipLimit: null,
    },
  ]);

  const cf1Area = id();
  const cf1Effort = id();
  const cf1Release = id();

  await db.insert(customFields).values([
    {
      id: cf1Area,
      projectId: p1,
      name: "Workstream",
      fieldType: "select",
      options: JSON.stringify([
        { id: "frontend", label: "Frontend", color: "#3b82f6" },
        { id: "backend", label: "Backend", color: "#10b981" },
        { id: "infra", label: "Infra", color: "#f59e0b" },
        { id: "design", label: "Design", color: "#ec4899" },
      ]),
      applicableTypeIds: "[]",
      showOnCard: true,
      position: 0,
    },
    {
      id: cf1Effort,
      projectId: p1,
      name: "Effort (hrs)",
      fieldType: "number",
      options: "[]",
      applicableTypeIds: "[]",
      showOnCard: true,
      position: 1,
    },
    {
      id: cf1Release,
      projectId: p1,
      name: "Target Release",
      fieldType: "text",
      options: "[]",
      applicableTypeIds: "[]",
      showOnCard: false,
      position: 2,
    },
  ]);

  const i1Parent = id();
  const i2 = id();
  const i3 = id();
  const i4 = id();
  const i5 = id();
  const i6 = id();
  const i7 = id();
  const i8 = id();

  await db.insert(items).values([
    {
      id: i1Parent,
      projectId: p1,
      key: "PLAT-1",
      number: 1,
      title: "Q4 Performance & Search Overhaul",
      description:
        "Parent initiative tracking search latency reductions and instant filtering across all views.",
      typeId: t1Init,
      statusId: s1InProg,
      priority: "high",
      parentId: null,
      labels: JSON.stringify(["q4", "performance"]),
      dueDate: "2026-12-15",
      customFields: JSON.stringify({
        [cf1Area]: "backend",
        [cf1Effort]: 24,
        [cf1Release]: "v2.4",
      }),
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: i2,
      projectId: p1,
      key: "PLAT-2",
      number: 2,
      title: "Add keyboard shortcuts & Command Palette",
      description:
        "Support `Ctrl+K` quick jump, `C` to create a new item, and single-key board navigation.",
      typeId: t1Feat,
      statusId: s1InProg,
      priority: "high",
      parentId: i1Parent,
      labels: JSON.stringify(["ux", "speed"]),
      dueDate: "2026-12-01",
      customFields: JSON.stringify({
        [cf1Area]: "frontend",
        [cf1Effort]: 6,
        [cf1Release]: "v2.4",
      }),
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: i3,
      projectId: p1,
      key: "PLAT-3",
      number: 3,
      title: "Fix swimline collapse state not persisting on reload",
      description:
        "When collapsing a swimline and refreshing the browser, all lines expand again.",
      typeId: t1Bug,
      statusId: s1Todo,
      priority: "urgent",
      parentId: null,
      labels: JSON.stringify(["board"]),
      dueDate: "2026-11-28",
      customFields: JSON.stringify({
        [cf1Area]: "frontend",
        [cf1Effort]: 2,
      }),
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: i4,
      projectId: p1,
      key: "PLAT-4",
      number: 4,
      title: "Index custom fields for instant query filtering",
      description:
        "Build lightweight in-memory indexing for custom select and text fields.",
      typeId: t1Task,
      statusId: s1Review,
      priority: "medium",
      parentId: i1Parent,
      labels: JSON.stringify(["search"]),
      dueDate: "2026-12-03",
      customFields: JSON.stringify({
        [cf1Area]: "backend",
        [cf1Effort]: 8,
        [cf1Release]: "v2.4",
      }),
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: i5,
      projectId: p1,
      key: "PLAT-5",
      number: 5,
      title: "Design customizable card density presets",
      description:
        "Allow switching between Comfortable and Compact board card modes.",
      typeId: t1Feat,
      statusId: s1Backlog,
      priority: "low",
      parentId: null,
      labels: JSON.stringify(["design"]),
      dueDate: null,
      customFields: JSON.stringify({
        [cf1Area]: "design",
        [cf1Effort]: 4,
      }),
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: i6,
      projectId: p1,
      key: "PLAT-6",
      number: 6,
      title: "Automated daily SQLite snapshot backup script",
      description: "Rotate last 14 snapshots of the local database file.",
      typeId: t1Task,
      statusId: s1Todo,
      priority: "medium",
      parentId: null,
      labels: JSON.stringify(["ops"]),
      dueDate: "2026-12-08",
      customFields: JSON.stringify({
        [cf1Area]: "infra",
        [cf1Effort]: 3,
      }),
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: i7,
      projectId: p1,
      key: "PLAT-7",
      number: 7,
      title: "Eliminate hardcoded 'Issue' terminology across UI",
      description:
        "Every project can name its own work types and nouns freely.",
      typeId: t1Feat,
      statusId: s1Done,
      priority: "high",
      parentId: null,
      labels: JSON.stringify(["core", "customization"]),
      dueDate: "2026-11-24",
      customFields: JSON.stringify({
        [cf1Area]: "frontend",
        [cf1Effort]: 5,
        [cf1Release]: "v2.3",
      }),
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: i8,
      projectId: p1,
      key: "PLAT-8",
      number: 8,
      title: "Audit dark mode contrast ratios on badges",
      description: "Ensure all custom status and label pills meet WCAG AA.",
      typeId: t1Task,
      statusId: s1Backlog,
      priority: "medium",
      parentId: null,
      labels: JSON.stringify(["a11y", "design"]),
      dueDate: null,
      customFields: JSON.stringify({
        [cf1Area]: "design",
        [cf1Effort]: 2,
      }),
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(comments).values({
    id: id(),
    itemId: i1Parent,
    author: "You",
    body: "Kickoff note: try switching the **Swimlines** dropdown above the board to **Workstream**, **Item Type**, or **Parent**!",
    createdAt: now,
  });

  // --- Project 2: Personal Ideas & Experiments ---
  const p2 = id();
  const p2Settings = {
    ...DEFAULT_PROJECT_SETTINGS,
    defaultNounSingular: "Idea",
    defaultNounPlural: "Ideas",
    defaultSwimlane: "none",
  };

  await db.insert(projects).values({
    id: p2,
    name: "Personal Sandbox",
    key: "IDEA",
    description: "Side projects, reading list, and weekend experiments.",
    icon: "Rocket",
    color: "#8b5cf6",
    itemCounter: 3,
    settings: JSON.stringify(p2Settings),
    createdAt: now,
    updatedAt: now,
  });

  const t2Idea = id();
  const t2Exp = id();
  const t2Note = id();

  await db.insert(itemTypes).values([
    {
      id: t2Idea,
      projectId: p2,
      name: "Idea",
      pluralName: "Ideas",
      icon: "Lightbulb",
      color: "#f59e0b",
      position: 0,
    },
    {
      id: t2Exp,
      projectId: p2,
      name: "Experiment",
      pluralName: "Experiments",
      icon: "FlaskConical",
      color: "#ec4899",
      position: 1,
    },
    {
      id: t2Note,
      projectId: p2,
      name: "Goal",
      pluralName: "Goals",
      icon: "Target",
      color: "#10b981",
      position: 2,
    },
  ]);

  const s2Inbox = id();
  const s2Explore = id();
  const s2Shipped = id();

  await db.insert(statuses).values([
    {
      id: s2Inbox,
      projectId: p2,
      name: "Inbox",
      category: "backlog",
      color: "#64748b",
      position: 0,
      wipLimit: null,
    },
    {
      id: s2Explore,
      projectId: p2,
      name: "Exploring",
      category: "in_progress",
      color: "#8b5cf6",
      position: 1,
      wipLimit: null,
    },
    {
      id: s2Shipped,
      projectId: p2,
      name: "Shipped",
      category: "done",
      color: "#10b981",
      position: 2,
      wipLimit: null,
    },
  ]);

  await db.insert(items).values([
    {
      id: id(),
      projectId: p2,
      key: "IDEA-1",
      number: 1,
      title: "Build custom personal finance dashboard",
      description: "Simple CSV import + monthly trend charts.",
      typeId: t2Idea,
      statusId: s2Inbox,
      priority: "medium",
      parentId: null,
      labels: JSON.stringify(["weekend"]),
      dueDate: null,
      customFields: "{}",
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId: p2,
      key: "IDEA-2",
      number: 2,
      title: "Try local-first sync with CRDTs",
      description: "Evaluate Automerge vs Yjs for offline editing.",
      typeId: t2Exp,
      statusId: s2Explore,
      priority: "high",
      parentId: null,
      labels: JSON.stringify(["tech"]),
      dueDate: null,
      customFields: "{}",
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      projectId: p2,
      key: "IDEA-3",
      number: 3,
      title: "Launch Keel v0.1 for daily work",
      description: "Replace clunky workflows with a fast, tailored work board.",
      typeId: t2Note,
      statusId: s2Shipped,
      priority: "high",
      parentId: null,
      labels: JSON.stringify(["milestone"]),
      dueDate: null,
      customFields: "{}",
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}
