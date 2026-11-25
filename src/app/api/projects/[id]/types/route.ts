import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { itemTypes, projects } from "@/db/schema";
import { serializeItemType } from "@/db/serializers";
import {
  LIMITS,
  parseJsonBody,
  sanitizeColor,
  sanitizeIcon,
} from "@/lib/api";
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

  const [last] = await db
    .select({ position: itemTypes.position })
    .from(itemTypes)
    .where(eq(itemTypes.projectId, projectId))
    .orderBy(desc(itemTypes.position))
    .limit(1);

  const rawLevel = Number(body.level);
  const level =
    Number.isFinite(rawLevel) && rawLevel >= 1 && rawLevel <= 5
      ? Math.round(rawLevel)
      : 2;

  const pluralName =
    typeof body.pluralName === "string" && body.pluralName.trim()
      ? body.pluralName.trim().slice(0, LIMITS.NAME)
      : `${name}s`;

  const typeId = crypto.randomUUID();
  await db.insert(itemTypes).values({
    id: typeId,
    projectId,
    name,
    pluralName,
    icon: sanitizeIcon(body.icon, "CheckSquare"),
    color: sanitizeColor(body.color, "#3b82f6"),
    level,
    position: last ? last.position + 1 : 0,
  });

  const [created] = await db
    .select()
    .from(itemTypes)
    .where(eq(itemTypes.id, typeId));

  return NextResponse.json(serializeItemType(created), { status: 201 });
}
