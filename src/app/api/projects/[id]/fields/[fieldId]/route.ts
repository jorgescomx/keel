import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { customFields } from "@/db/schema";
import { serializeCustomField } from "@/db/serializers";
import {
  checkSameOrigin,
  LIMITS,
  parseJsonBody,
  sanitizeSelectOptions,
  sanitizeStringArray,
  VALID_CUSTOM_FIELD_TYPES,
} from "@/lib/api";
import type { CustomFieldType } from "@/types";

type Params = { params: Promise<{ id: string; fieldId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { id: projectId, fieldId } = await params;

  const [existing] = await db
    .select()
    .from(customFields)
    .where(
      and(eq(customFields.id, fieldId), eq(customFields.projectId, projectId))
    );

  if (!existing) {
    return NextResponse.json(
      { error: "Custom field not found" },
      { status: 404 }
    );
  }

  const patch: Partial<typeof customFields.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, LIMITS.NAME);
  }
  if (typeof body.fieldType === "string") {
    if (!VALID_CUSTOM_FIELD_TYPES.has(body.fieldType as CustomFieldType)) {
      return NextResponse.json(
        { error: "Invalid fieldType" },
        { status: 400 }
      );
    }
    patch.fieldType = body.fieldType;
  }
  if (Array.isArray(body.options)) {
    const opts = sanitizeSelectOptions(body.options);
    if (opts) patch.options = JSON.stringify(opts);
  }
  if (Array.isArray(body.applicableTypeIds)) {
    const ids = sanitizeStringArray(body.applicableTypeIds, 50, 64);
    if (ids) patch.applicableTypeIds = JSON.stringify(ids);
  }
  if (typeof body.showOnCard === "boolean") patch.showOnCard = body.showOnCard;
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    patch.position = Math.max(0, Math.round(body.position));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(serializeCustomField(existing));
  }

  await db
    .update(customFields)
    .set(patch)
    .where(
      and(eq(customFields.id, fieldId), eq(customFields.projectId, projectId))
    );

  const [updated] = await db
    .select()
    .from(customFields)
    .where(
      and(eq(customFields.id, fieldId), eq(customFields.projectId, projectId))
    );

  return NextResponse.json(serializeCustomField(updated));
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { id: projectId, fieldId } = await params;

  const [existing] = await db
    .select({ id: customFields.id })
    .from(customFields)
    .where(
      and(eq(customFields.id, fieldId), eq(customFields.projectId, projectId))
    );

  if (!existing) {
    return NextResponse.json(
      { error: "Custom field not found" },
      { status: 404 }
    );
  }

  await db
    .delete(customFields)
    .where(
      and(eq(customFields.id, fieldId), eq(customFields.projectId, projectId))
    );

  return NextResponse.json({ ok: true });
}
