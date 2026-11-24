import { asc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import {
  projects,
  itemTypes,
  statuses,
  customFields,
  items,
} from "@/db/schema";
import {
  serializeProject,
  serializeItemType,
  serializeStatus,
  serializeCustomField,
  serializeItem,
} from "@/db/serializers";
import { ensureProjectViews } from "@/db/ensureViews";
import { WorkspaceApp } from "@/components/WorkspaceApp";
import type { ProjectBundle } from "@/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDbReady();

  const projectRows = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.createdAt));

  const serializedProjects = projectRows.map(serializeProject);
  let initialBundle: ProjectBundle | null = null;

  if (serializedProjects.length > 0) {
    const first = serializedProjects[0];
    const [typeRows, statusRows, fieldRows, itemRows, projectViews] =
      await Promise.all([
        db
          .select()
          .from(itemTypes)
          .where(eq(itemTypes.projectId, first.id))
          .orderBy(asc(itemTypes.position)),
        db
          .select()
          .from(statuses)
          .where(eq(statuses.projectId, first.id))
          .orderBy(asc(statuses.position)),
        db
          .select()
          .from(customFields)
          .where(eq(customFields.projectId, first.id))
          .orderBy(asc(customFields.position)),
        db
          .select()
          .from(items)
          .where(eq(items.projectId, first.id))
          .orderBy(asc(items.position), asc(items.number)),
        ensureProjectViews(first),
      ]);

    initialBundle = {
      project: first,
      itemTypes: typeRows.map(serializeItemType),
      statuses: statusRows.map(serializeStatus),
      customFields: fieldRows.map(serializeCustomField),
      views: projectViews,
      items: itemRows.map(serializeItem),
    };
  }

  return (
    <WorkspaceApp
      initialProjects={serializedProjects}
      initialBundle={initialBundle}
    />
  );
}
