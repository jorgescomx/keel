import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { items, projects } from "@/db/schema";
import { serializeProject } from "@/db/serializers";
import {
  isPlainObject,
  LIMITS,
  parseJsonBody,
  sanitizeCustomFieldValues,
  VALID_PRIORITIES,
  validateItemReferences,
} from "@/lib/api";
import type { Priority } from "@/types";

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!Array.isArray(body.updates)) {
    return NextResponse.json(
      { error: "updates must be an array" },
      { status: 400 }
    );
  }

  if (body.updates.length > LIMITS.MAX_REORDER_UPDATES) {
    return NextResponse.json(
      { error: `Too many updates (max ${LIMITS.MAX_REORDER_UPDATES})` },
      { status: 400 }
    );
  }

  if (body.updates.length === 0) {
    return NextResponse.json({ ok: true });
  }

  // Validate shape of every update entry before touching the database
  const normalized: Array<{
    id: string;
    statusId: string;
    position: number;
    priority?: Priority;
    typeId?: string;
    parentId?: string | null;
    customFields?: Record<string, unknown>;
  }> = [];

  for (const raw of body.updates) {
    if (!isPlainObject(raw)) {
      return NextResponse.json(
        { error: "Each update must be an object" },
        { status: 400 }
      );
    }
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const statusId =
      typeof raw.statusId === "string" ? raw.statusId.trim() : "";
    const position =
      typeof raw.position === "number" && Number.isFinite(raw.position)
        ? Math.max(0, Math.round(raw.position))
        : NaN;

    if (!id || !statusId || Number.isNaN(position)) {
      return NextResponse.json(
        { error: "Each update requires id, statusId, and numeric position" },
        { status: 400 }
      );
    }

    const entry: (typeof normalized)[number] = { id, statusId, position };

    if (raw.priority !== undefined) {
      if (
        typeof raw.priority !== "string" ||
        !VALID_PRIORITIES.has(raw.priority as Priority)
      ) {
        return NextResponse.json(
          { error: "Invalid priority in updates" },
          { status: 400 }
        );
      }
      entry.priority = raw.priority as Priority;
    }

    if (raw.typeId !== undefined) {
      if (typeof raw.typeId !== "string" || !raw.typeId.trim()) {
        return NextResponse.json(
          { error: "Invalid typeId in updates" },
          { status: 400 }
        );
      }
      entry.typeId = raw.typeId.trim();
    }

    if ("parentId" in raw && raw.parentId !== undefined) {
      if (raw.parentId === null || raw.parentId === "") {
        entry.parentId = null;
      } else if (typeof raw.parentId === "string") {
        entry.parentId = raw.parentId.trim() || null;
      } else {
        return NextResponse.json(
          { error: "Invalid parentId in updates" },
          { status: 400 }
        );
      }
    }

    if (raw.customFields !== undefined) {
      const cf = sanitizeCustomFieldValues(raw.customFields);
      if (!cf) {
        return NextResponse.json(
          { error: "Invalid customFields in updates" },
          { status: 400 }
        );
      }
      entry.customFields = cf;
    }

    normalized.push(entry);
  }

  // Load existing items to verify project scoping for statusId/typeId/parentId
  const existingRows = await db
    .select()
    .from(items)
    .where(inArray(items.id, normalized.map((u) => u.id)));
  const existingById = new Map(existingRows.map((r) => [r.id, r]));

  const projectIds = [...new Set(existingRows.map((r) => r.projectId))];
  const projectRows =
    projectIds.length > 0
      ? await db
          .select()
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : [];
  const enforceByProject = new Map(
    projectRows.map((p) => [
      p.id,
      Boolean(serializeProject(p).settings.enforceHierarchy),
    ])
  );

  for (const u of normalized) {
    const existing = existingById.get(u.id);
    if (!existing) continue;
    const refError = await validateItemReferences({
      projectId: existing.projectId,
      itemId: existing.id,
      typeId: u.typeId,
      effectiveTypeId: u.typeId ?? existing.typeId,
      statusId: u.statusId,
      parentId: u.parentId !== undefined ? u.parentId : existing.parentId,
      enforceHierarchy: enforceByProject.get(existing.projectId) ?? false,
    });
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 });
    }
  }

  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const u of normalized) {
      if (!existingById.has(u.id)) continue;
      const patch: Partial<typeof items.$inferInsert> = {
        statusId: u.statusId,
        position: u.position,
        updatedAt: now,
      };
      if (u.priority !== undefined) patch.priority = u.priority;
      if (u.typeId !== undefined) patch.typeId = u.typeId;
      if (u.parentId !== undefined) patch.parentId = u.parentId;
      if (u.customFields !== undefined) {
        patch.customFields = JSON.stringify(u.customFields);
      }
      await tx.update(items).set(patch).where(eq(items.id, u.id));
    }
  });

  return NextResponse.json({ ok: true });
}
