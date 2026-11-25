import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { projects, statuses } from "@/db/schema";
import { serializeStatus } from "@/db/serializers";
import {
  LIMITS,
  parseJsonBody,
  sanitizeColor,
  sanitizeStringArray,
  VALID_STATUS_CATEGORIES,
} from "@/lib/api";
import type { StatusCategory } from "@/types";
import { requireProjectAccess } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id: projectId } = await params;

  const access = await requireProjectAccess(projectId, "admin");
  if (!access.ok) return access.response;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const name =
    typeof body.name === "string"
      ? body.name.trim().slice(0, LIMITS.NAME)
      : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const category: StatusCategory =
    typeof body.category === "string" &&
    VALID_STATUS_CATEGORIES.has(body.category as StatusCategory)
      ? (body.category as StatusCategory)
      : "todo";

  const [last] = await db
    .select({ position: statuses.position })
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(desc(statuses.position))
    .limit(1);

  const statusId = crypto.randomUUID();
  await db.insert(statuses).values({
    id: statusId,
    projectId,
    name,
    category,
    color: sanitizeColor(body.color, "#3b82f6"),
    position: last ? last.position + 1 : 0,
    wipLimit:
      typeof body.wipLimit === "number" &&
      Number.isFinite(body.wipLimit) &&
      body.wipLimit > 0
        ? Math.min(10_000, Math.round(body.wipLimit))
        : null,
  });

  const [created] = await db
    .select()
    .from(statuses)
    .where(eq(statuses.id, statusId));

  return NextResponse.json(serializeStatus(created), { status: 201 });
}

export async function PUT(req: Request, { params }: Params) {
  // Batch reorder statuses scoped to this project
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id: projectId } = await params;

  const access = await requireProjectAccess(projectId, "admin");
  if (!access.ok) return access.response;

  const orderedIds = sanitizeStringArray(body.orderedIds, 100, 64) ?? [];

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(statuses)
        .set({ position: i })
        .where(
          and(eq(statuses.id, orderedIds[i]), eq(statuses.projectId, projectId))
        );
    }
  });

  const rows = await db
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(asc(statuses.position));

  return NextResponse.json(rows.map(serializeStatus));
}
