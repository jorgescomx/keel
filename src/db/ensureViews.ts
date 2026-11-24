import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "./index";
import { views, statuses } from "./schema";
import { serializeView } from "./serializers";
import type { Project, ProjectView } from "@/types";

export async function ensureProjectViews(
  project: Project
): Promise<ProjectView[]> {
  const existing = await db
    .select()
    .from(views)
    .where(eq(views.projectId, project.id))
    .orderBy(asc(views.position));

  if (existing.length > 0) {
    return existing.map(serializeView);
  }

  const projectStatuses = await db
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, project.id))
    .orderBy(asc(statuses.position));

  const backlogStatus = projectStatuses.find((s) => s.category === "backlog");

  const starterViews = [
    {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: "Main Board",
      layout: "board",
      query: "",
      filters: "{}",
      hiddenStatusIds: "[]",
      swimlaneBy: project.settings.defaultSwimlane || "none",
      compact: false,
      position: 0,
    },
    {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: "Active Focus",
      layout: "board",
      query: "priority in (urgent, high)",
      filters: "{}",
      hiddenStatusIds: JSON.stringify(backlogStatus ? [backlogStatus.id] : []),
      swimlaneBy: "type",
      compact: false,
      position: 1,
    },
    {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: `All ${project.settings.defaultNounPlural}`,
      layout: "list",
      query: "",
      filters: "{}",
      hiddenStatusIds: "[]",
      swimlaneBy: "none",
      compact: false,
      position: 2,
    },
  ];

  await db.insert(views).values(starterViews);

  const created = await db
    .select()
    .from(views)
    .where(eq(views.projectId, project.id))
    .orderBy(asc(views.position));

  return created.map(serializeView);
}
