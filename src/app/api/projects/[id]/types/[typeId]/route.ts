import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { itemTypes, items } from "@/db/schema";
import { serializeItemType } from "@/db/serializers";
import {
  checkSameOrigin,
  LIMITS,
  parseJsonBody,
  sanitizeColor,
  sanitizeIcon,
} from "@/lib/api";

type Params = { params: Promise<{ id: string; typeId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id: projectId, typeId } = await params;

  const [existing] = await db
    .select()
    .from(itemTypes)
    .where(and(eq(itemTypes.id, typeId), eq(itemTypes.projectId, projectId)));

  if (!existing) {
    return NextResponse.json(
      { error: "Item type not found" },
      { status: 404 }
    );
  }

  const patch: Partial<typeof itemTypes.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, LIMITS.NAME);
  }
  if (typeof body.pluralName === "string" && body.pluralName.trim()) {
    patch.pluralName = body.pluralName.trim().slice(0, LIMITS.NAME);
  }
  if (typeof body.icon === "string") {
    patch.icon = sanitizeIcon(body.icon, existing.icon);
  }
  if (typeof body.color === "string") {
    patch.color = sanitizeColor(body.color, existing.color);
  }
  if (
    typeof body.level === "number" &&
    Number.isFinite(body.level) &&
    body.level >= 1 &&
    body.level <= 5
  ) {
    patch.level = Math.round(body.level);
  }
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    patch.position = Math.max(0, Math.round(body.position));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(serializeItemType(existing));
  }

  await db
    .update(itemTypes)
    .set(patch)
    .where(and(eq(itemTypes.id, typeId), eq(itemTypes.projectId, projectId)));

  const [updated] = await db
    .select()
    .from(itemTypes)
    .where(and(eq(itemTypes.id, typeId), eq(itemTypes.projectId, projectId)));

  return NextResponse.json(serializeItemType(updated));
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { id: projectId, typeId } = await params;

  const [existing] = await db
    .select({ id: itemTypes.id })
    .from(itemTypes)
    .where(and(eq(itemTypes.id, typeId), eq(itemTypes.projectId, projectId)));

  if (!existing) {
    return NextResponse.json(
      { error: "Item type not found" },
      { status: 404 }
    );
  }

  const others = await db
    .select()
    .from(itemTypes)
    .where(and(eq(itemTypes.projectId, projectId), ne(itemTypes.id, typeId)));

  if (others.length === 0) {
    return NextResponse.json(
      { error: "Cannot delete the last item type in a project" },
      { status: 400 }
    );
  }

  await db.transaction(async (tx) => {
    // Reassign existing items of this type within this project to the first remaining type
    await tx
      .update(items)
      .set({ typeId: others[0].id })
      .where(and(eq(items.typeId, typeId), eq(items.projectId, projectId)));

    await tx
      .delete(itemTypes)
      .where(and(eq(itemTypes.id, typeId), eq(itemTypes.projectId, projectId)));
  });

  return NextResponse.json({ ok: true });
}
