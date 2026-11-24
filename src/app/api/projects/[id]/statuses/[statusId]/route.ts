import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { statuses, items } from "@/db/schema";
import { serializeStatus } from "@/db/serializers";
import {
  checkSameOrigin,
  LIMITS,
  parseJsonBody,
  sanitizeColor,
  VALID_STATUS_CATEGORIES,
} from "@/lib/api";
import type { StatusCategory } from "@/types";

type Params = { params: Promise<{ id: string; statusId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id: projectId, statusId } = await params;

  const [existing] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));

  if (!existing) {
    return NextResponse.json({ error: "Status not found" }, { status: 404 });
  }

  const patch: Partial<typeof statuses.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, LIMITS.NAME);
  }
  if (typeof body.category === "string") {
    if (!VALID_STATUS_CATEGORIES.has(body.category as StatusCategory)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    patch.category = body.category;
  }
  if (typeof body.color === "string") {
    patch.color = sanitizeColor(body.color, existing.color);
  }
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    patch.position = Math.max(0, Math.round(body.position));
  }
  if ("wipLimit" in body) {
    patch.wipLimit =
      typeof body.wipLimit === "number" &&
      Number.isFinite(body.wipLimit) &&
      body.wipLimit > 0
        ? Math.min(10_000, Math.round(body.wipLimit))
        : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(serializeStatus(existing));
  }

  await db
    .update(statuses)
    .set(patch)
    .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));

  const [updated] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));

  return NextResponse.json(serializeStatus(updated));
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { id: projectId, statusId } = await params;

  const [existing] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));

  if (!existing) {
    return NextResponse.json({ error: "Status not found" }, { status: 404 });
  }

  const others = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.projectId, projectId), ne(statuses.id, statusId)));

  if (others.length === 0) {
    return NextResponse.json(
      { error: "Cannot delete the last column in a project" },
      { status: 400 }
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(items)
      .set({ statusId: others[0].id })
      .where(
        and(eq(items.statusId, statusId), eq(items.projectId, projectId))
      );

    await tx
      .delete(statuses)
      .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));
  });

  return NextResponse.json({ ok: true });
}
