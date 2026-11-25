import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { items, projects } from "@/db/schema";
import { serializeItem, serializeProject } from "@/db/serializers";
import {
  LIMITS,
  parseJsonBody,
  sanitizeCustomFieldValues,
  sanitizeDueDate,
  sanitizeStringArray,
  VALID_PRIORITIES,
  validateItemReferences,
} from "@/lib/api";
import type { Priority } from "@/types";
import { requireProjectAccess } from "@/lib/auth";
import { encryptString } from "@/lib/crypto";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id: projectId } = await params;

  const access = await requireProjectAccess(projectId, "member");
  if (!access.ok) return access.response;

  const [projectRow] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!projectRow) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = serializeProject(projectRow);

  const title =
    typeof body.title === "string"
      ? body.title.trim().slice(0, LIMITS.TITLE)
      : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const typeId = typeof body.typeId === "string" ? body.typeId.trim() : "";
  const statusId =
    typeof body.statusId === "string" ? body.statusId.trim() : "";
  if (!typeId || !statusId) {
    return NextResponse.json(
      { error: "typeId and statusId are required" },
      { status: 400 }
    );
  }

  const parentId =
    typeof body.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : null;

  const refError = await validateItemReferences({
    projectId,
    typeId,
    effectiveTypeId: typeId,
    statusId,
    parentId,
    enforceHierarchy: Boolean(project.settings.enforceHierarchy),
  });
  if (refError) {
    return NextResponse.json({ error: refError }, { status: 400 });
  }

  const priority: Priority =
    typeof body.priority === "string" &&
    VALID_PRIORITIES.has(body.priority as Priority)
      ? (body.priority as Priority)
      : "medium";

  const dueDate =
    "dueDate" in body ? sanitizeDueDate(body.dueDate) : null;
  if (dueDate === undefined) {
    return NextResponse.json(
      { error: "dueDate must be YYYY-MM-DD or null" },
      { status: 400 }
    );
  }

  const labels =
    sanitizeStringArray(body.labels, LIMITS.MAX_LABELS, LIMITS.LABEL) ?? [];
  const customFieldVals = sanitizeCustomFieldValues(body.customFields) ?? {};
  const description =
    typeof body.description === "string"
      ? body.description.slice(0, LIMITS.DESCRIPTION)
      : "";

  const now = new Date().toISOString();
  const itemId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    // Atomically increment itemCounter in SQL to avoid duplicate keys under concurrency
    const [updatedProject] = await tx
      .update(projects)
      .set({
        itemCounter: sql`${projects.itemCounter} + 1`,
        updatedAt: now,
      })
      .where(eq(projects.id, projectId))
      .returning({ itemCounter: projects.itemCounter, key: projects.key });

    const nextNum = updatedProject.itemCounter;
    const key = `${updatedProject.key}-${nextNum}`;

    const [lastInStatus] = await tx
      .select({ position: items.position })
      .from(items)
      .where(and(eq(items.projectId, projectId), eq(items.statusId, statusId)))
      .orderBy(desc(items.position))
      .limit(1);

    const nextPos = lastInStatus ? lastInStatus.position + 1 : 0;

    await tx.insert(items).values({
      id: itemId,
      projectId,
      key,
      number: nextNum,
      title: encryptString(title),
      description: encryptString(description),
      typeId,
      statusId,
      priority,
      parentId,
      labels: JSON.stringify(labels),
      dueDate,
      customFields: encryptString(JSON.stringify(customFieldVals)),
      position: nextPos,
      createdAt: now,
      updatedAt: now,
    });
  });

  const [created] = await db.select().from(items).where(eq(items.id, itemId));
  return NextResponse.json(serializeItem(created), { status: 201 });
}
