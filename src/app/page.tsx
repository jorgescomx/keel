import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import {
  projects,
  itemTypes,
  statuses,
  customFields,
  items,
  projectMembers,
  users,
} from "@/db/schema";
import {
  serializeProject,
  serializeItemType,
  serializeStatus,
  serializeCustomField,
  serializeItem,
} from "@/db/serializers";
import { ensureProjectViews } from "@/db/ensureViews";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceApp } from "@/components/WorkspaceApp";
import type { ProjectBundle, ProjectRole } from "@/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDbReady();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const memberProjectRows = await db
    .select({
      project: projects,
      role: projectMembers.role,
    })
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, currentUser.id))
    .orderBy(asc(projects.createdAt));

  const serializedProjects = memberProjectRows.map((r) =>
    serializeProject(r.project)
  );
  let initialBundle: ProjectBundle | null = null;

  if (serializedProjects.length > 0) {
    const first = serializedProjects[0];
    const firstRole = memberProjectRows[0].role as ProjectRole;

    const [typeRows, statusRows, fieldRows, itemRows, projectViews, memberRows] =
      await Promise.all([
        db
          .select()
          .from(itemTypes)
          .where(eq(itemTypes.projectId, first.id))
          .orderBy(asc(itemTypes.level), asc(itemTypes.position)),
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
        db
          .select({
            id: projectMembers.id,
            projectId: projectMembers.projectId,
            userId: projectMembers.userId,
            role: projectMembers.role,
            createdAt: projectMembers.createdAt,
            email: users.email,
            name: users.name,
          })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(eq(projectMembers.projectId, first.id))
          .orderBy(asc(projectMembers.createdAt)),
      ]);

    initialBundle = {
      project: first,
      myRole: firstRole,
      members: memberRows.map((m) => ({
        ...m,
        role: m.role as ProjectRole,
      })),
      itemTypes: typeRows.map(serializeItemType),
      statuses: statusRows.map(serializeStatus),
      customFields: fieldRows.map(serializeCustomField),
      views: projectViews,
      items: itemRows.map(serializeItem),
    };
  }

  return (
    <WorkspaceApp
      currentUser={currentUser}
      initialProjects={serializedProjects}
      initialBundle={initialBundle}
    />
  );
}
