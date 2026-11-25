import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import {
  projects,
  itemTypes,
  statuses,
  customFields,
  items,
  comments,
  views,
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
import {
  checkSameOrigin,
  isUniqueConstraintError,
  LIMITS,
  mergeProjectSettings,
  parseJsonBody,
  sanitizeColor,
  sanitizeIcon,
} from "@/lib/api";
import { requireProjectAccess } from "@/lib/auth";
import { encryptString } from "@/lib/crypto";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureDbReady();
  const { id } = await params;

  const access = await requireProjectAccess(id, "viewer");
  if (!access.ok) return access.response;

  const [projectRow] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  if (!projectRow) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const serializedProject = serializeProject(projectRow);

  const [typeRows, statusRows, fieldRows, itemRows, projectViews, memberRows] =
    await Promise.all([
      db
        .select()
        .from(itemTypes)
        .where(eq(itemTypes.projectId, id))
        .orderBy(asc(itemTypes.level), asc(itemTypes.position)),
      db
        .select()
        .from(statuses)
        .where(eq(statuses.projectId, id))
        .orderBy(asc(statuses.position)),
      db
        .select()
        .from(customFields)
        .where(eq(customFields.projectId, id))
        .orderBy(asc(customFields.position)),
      db
        .select()
        .from(items)
        .where(eq(items.projectId, id))
        .orderBy(asc(items.position), asc(items.number)),
      ensureProjectViews(serializedProject),
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
        .where(eq(projectMembers.projectId, id))
        .orderBy(asc(projectMembers.createdAt)),
    ]);

  return NextResponse.json({
    project: serializedProject,
    myRole: access.role,
    members: memberRows,
    itemTypes: typeRows.map(serializeItemType),
    statuses: statusRows.map(serializeStatus),
    customFields: fieldRows.map(serializeCustomField),
    views: projectViews,
    items: itemRows.map(serializeItem),
  });
}

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id } = await params;

  const access = await requireProjectAccess(id, "admin");
  if (!access.ok) return access.response;

  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const currentProject = serializeProject(existing);
  const nextSettings = mergeProjectSettings(
    currentProject.settings,
    body.settings
  );

  const updateData: Partial<typeof projects.$inferInsert> = {
    updatedAt: new Date().toISOString(),
    settings: JSON.stringify(nextSettings),
  };

  if (typeof body.name === "string" && body.name.trim()) {
    updateData.name = body.name.trim().slice(0, LIMITS.NAME);
  }
  if (typeof body.key === "string" && body.key.trim()) {
    const cleanedKey = body.key
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    if (!cleanedKey) {
      return NextResponse.json(
        { error: "Project key must contain alphanumeric characters" },
        { status: 400 }
      );
    }
    updateData.key = cleanedKey;
  }
  if (typeof body.description === "string") {
    updateData.description = encryptString(
      body.description.slice(0, LIMITS.DESCRIPTION)
    );
  }
  if (typeof body.icon === "string") {
    updateData.icon = sanitizeIcon(body.icon, existing.icon);
  }
  if (typeof body.color === "string") {
    updateData.color = sanitizeColor(body.color, existing.color);
  }

  try {
    await db.update(projects).set(updateData).where(eq(projects.id, id));
  } catch (err: unknown) {
    console.error("Failed to update project:", err);
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: "A project with that key already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }

  const [updated] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  return NextResponse.json(serializeProject(updated));
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { id } = await params;

  const access = await requireProjectAccess(id, "owner");
  if (!access.ok) return access.response;

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    // Delete children explicitly in dependency order so all cards, comments,
    // views, custom fields, statuses, and item types are cleanly removed.
    const projectItems = await tx
      .select({ id: items.id })
      .from(items)
      .where(eq(items.projectId, id));

    if (projectItems.length > 0) {
      await tx
        .delete(comments)
        .where(inArray(comments.itemId, projectItems.map((i) => i.id)));
    }

    await tx.delete(items).where(eq(items.projectId, id));
    await tx.delete(views).where(eq(views.projectId, id));
    await tx.delete(customFields).where(eq(customFields.projectId, id));
    await tx.delete(statuses).where(eq(statuses.projectId, id));
    await tx.delete(itemTypes).where(eq(itemTypes.projectId, id));
    await tx.delete(projects).where(eq(projects.id, id));
  });

  return NextResponse.json({ ok: true });
}
