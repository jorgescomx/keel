import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { items, projectMembers, projects } from "@/db/schema";
import { serializeItem, serializeProject } from "@/db/serializers";
import {
  checkSameOrigin,
  LIMITS,
  parseJsonBody,
  sanitizeCustomFieldValues,
  sanitizeDueDate,
  sanitizeStringArray,
  VALID_PRIORITIES,
  validateCustomFieldValuesForProject,
  validateItemReferences,
} from "@/lib/api";
import type { Priority } from "@/types";
import { requireProjectAccess } from "@/lib/auth";
import { encryptString } from "@/lib/crypto";

type Params = { params: Promise<{ itemId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { itemId } = await params;

  const [existing] = await db.select().from(items).where(eq(items.id, itemId));
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId, "member");
  if (!access.ok) return access.response;

  const [projectRow] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, existing.projectId));
  const enforceHierarchy = projectRow
    ? Boolean(serializeProject(projectRow).settings.enforceHierarchy)
    : false;

  const updateData: Partial<typeof items.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (typeof body.title === "string" && body.title.trim()) {
    updateData.title = encryptString(body.title.trim().slice(0, LIMITS.TITLE));
  }
  if (typeof body.description === "string") {
    updateData.description = encryptString(
      body.description.slice(0, LIMITS.DESCRIPTION)
    );
  }

  let nextTypeId: string | undefined;
  if (typeof body.typeId === "string" && body.typeId.trim()) {
    nextTypeId = body.typeId.trim();
    updateData.typeId = nextTypeId;
  }

  let nextStatusId: string | undefined;
  if (typeof body.statusId === "string" && body.statusId.trim()) {
    nextStatusId = body.statusId.trim();
    updateData.statusId = nextStatusId;
  }

  if (typeof body.priority === "string") {
    if (!VALID_PRIORITIES.has(body.priority as Priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    updateData.priority = body.priority;
  }

  if ("ownerId" in body) {
    if (body.ownerId === null || body.ownerId === "") {
      updateData.ownerId = null;
    } else if (typeof body.ownerId === "string" && body.ownerId.trim()) {
      const candidateOwner = body.ownerId.trim();
      const [member] = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, existing.projectId),
            eq(projectMembers.userId, candidateOwner)
          )
        )
        .limit(1);
      if (!member) {
        return NextResponse.json(
          { error: "Owner must be a member of this project" },
          { status: 400 }
        );
      }
      updateData.ownerId = candidateOwner;
    } else {
      return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });
    }
  }

  let nextParentId: string | null | undefined;
  if ("parentId" in body) {
    if (body.parentId === null || body.parentId === "") {
      nextParentId = null;
    } else if (typeof body.parentId === "string") {
      nextParentId = body.parentId.trim() || null;
    } else {
      return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
    }
    updateData.parentId = nextParentId;
  }

  // Validate cross-project scoping, cycles, and hierarchy rules
  if (
    nextTypeId !== undefined ||
    nextStatusId !== undefined ||
    nextParentId !== undefined
  ) {
    const refError = await validateItemReferences({
      projectId: existing.projectId,
      itemId,
      typeId: nextTypeId,
      effectiveTypeId: nextTypeId ?? existing.typeId,
      statusId: nextStatusId,
      parentId:
        nextParentId !== undefined ? nextParentId : existing.parentId ?? null,
      enforceHierarchy,
    });
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 });
    }
  }

  if (Array.isArray(body.labels)) {
    const labels = sanitizeStringArray(
      body.labels,
      LIMITS.MAX_LABELS,
      LIMITS.LABEL
    );
    if (labels) updateData.labels = JSON.stringify(labels);
  }

  if ("dueDate" in body) {
    const dueDate = sanitizeDueDate(body.dueDate);
    if (dueDate === undefined) {
      return NextResponse.json(
        { error: "dueDate must be YYYY-MM-DD or null" },
        { status: 400 }
      );
    }
    updateData.dueDate = dueDate;
  }

  if ("customFields" in body && body.customFields !== undefined) {
    const cf = sanitizeCustomFieldValues(body.customFields);
    if (!cf) {
      return NextResponse.json(
        { error: "customFields must be an object" },
        { status: 400 }
      );
    }
    const cfError = await validateCustomFieldValuesForProject(
      existing.projectId,
      cf
    );
    if (cfError) {
      return NextResponse.json({ error: cfError }, { status: 400 });
    }
    updateData.customFields = encryptString(JSON.stringify(cf));
  }

  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    updateData.position = Math.max(0, Math.round(body.position));
  }

  await db.update(items).set(updateData).where(eq(items.id, itemId));

  const [updated] = await db.select().from(items).where(eq(items.id, itemId));
  return NextResponse.json(serializeItem(updated));
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { itemId } = await params;

  const [existing] = await db
    .select({ id: items.id, projectId: items.projectId })
    .from(items)
    .where(eq(items.id, itemId));
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId, "member");
  if (!access.ok) return access.response;

  await db.transaction(async (tx) => {
    // Clear parentId on children so they aren't orphaned with dangling refs
    await tx
      .update(items)
      .set({ parentId: null })
      .where(eq(items.parentId, itemId));

    await tx.delete(items).where(eq(items.id, itemId));
  });

  return NextResponse.json({ ok: true });
}
