import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { views } from "@/db/schema";
import { serializeView } from "@/db/serializers";
import {
  checkSameOrigin,
  LIMITS,
  parseJsonBody,
  sanitizeStringArray,
  sanitizeViewFilters,
} from "@/lib/api";
import { requireProjectAccess } from "@/lib/auth";
import { encryptString } from "@/lib/crypto";

type Params = { params: Promise<{ id: string; viewId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id: projectId, viewId } = await params;

  const access = await requireProjectAccess(projectId, "member");
  if (!access.ok) return access.response;

  const [existing] = await db
    .select()
    .from(views)
    .where(and(eq(views.id, viewId), eq(views.projectId, projectId)));

  if (!existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  const patch: Partial<typeof views.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, LIMITS.NAME);
  }
  if (body.layout === "board" || body.layout === "list") {
    patch.layout = body.layout;
  }
  if (typeof body.query === "string") {
    patch.query = encryptString(body.query.slice(0, LIMITS.QUERY));
  }
  if (body.filters && typeof body.filters === "object") {
    patch.filters = encryptString(
      JSON.stringify(sanitizeViewFilters(body.filters))
    );
  }
  if (Array.isArray(body.hiddenStatusIds)) {
    const ids = sanitizeStringArray(body.hiddenStatusIds, 100, 64);
    if (ids) patch.hiddenStatusIds = JSON.stringify(ids);
  }
  if (typeof body.swimlaneBy === "string" && body.swimlaneBy.trim()) {
    patch.swimlaneBy = body.swimlaneBy.trim().slice(0, 80);
  }
  if (typeof body.compact === "boolean") {
    patch.compact = body.compact;
  }
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    patch.position = Math.max(0, Math.round(body.position));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(serializeView(existing));
  }

  await db
    .update(views)
    .set(patch)
    .where(and(eq(views.id, viewId), eq(views.projectId, projectId)));

  const [updated] = await db
    .select()
    .from(views)
    .where(and(eq(views.id, viewId), eq(views.projectId, projectId)));

  return NextResponse.json(serializeView(updated));
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { id: projectId, viewId } = await params;

  const access = await requireProjectAccess(projectId, "member");
  if (!access.ok) return access.response;

  const [existing] = await db
    .select({ id: views.id })
    .from(views)
    .where(and(eq(views.id, viewId), eq(views.projectId, projectId)));

  if (!existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  const others = await db
    .select()
    .from(views)
    .where(and(eq(views.projectId, projectId), ne(views.id, viewId)));

  if (others.length === 0) {
    return NextResponse.json(
      { error: "A project must keep at least one view" },
      { status: 400 }
    );
  }

  await db
    .delete(views)
    .where(and(eq(views.id, viewId), eq(views.projectId, projectId)));

  return NextResponse.json({ ok: true });
}
