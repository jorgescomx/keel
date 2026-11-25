import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { customFields, projects } from "@/db/schema";
import { serializeCustomField } from "@/db/serializers";
import {
  LIMITS,
  parseJsonBody,
  sanitizeSelectOptions,
  sanitizeStringArray,
  VALID_CUSTOM_FIELD_TYPES,
} from "@/lib/api";
import type { CustomFieldType } from "@/types";
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

  const fieldType: CustomFieldType =
    typeof body.fieldType === "string" &&
    VALID_CUSTOM_FIELD_TYPES.has(body.fieldType as CustomFieldType)
      ? (body.fieldType as CustomFieldType)
      : "text";

  const options = sanitizeSelectOptions(body.options) ?? [];
  const applicableTypeIds =
    sanitizeStringArray(body.applicableTypeIds, 50, 64) ?? [];

  const [last] = await db
    .select({ position: customFields.position })
    .from(customFields)
    .where(eq(customFields.projectId, projectId))
    .orderBy(desc(customFields.position))
    .limit(1);

  const fieldId = crypto.randomUUID();
  await db.insert(customFields).values({
    id: fieldId,
    projectId,
    name,
    fieldType,
    options: JSON.stringify(options),
    applicableTypeIds: JSON.stringify(applicableTypeIds),
    showOnCard: Boolean(body.showOnCard),
    position: last ? last.position + 1 : 0,
  });

  const [created] = await db
    .select()
    .from(customFields)
    .where(eq(customFields.id, fieldId));

  return NextResponse.json(serializeCustomField(created), { status: 201 });
}
