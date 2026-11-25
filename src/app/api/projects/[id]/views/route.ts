import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { projects, views } from "@/db/schema";
import { serializeView } from "@/db/serializers";
import {
  LIMITS,
  parseJsonBody,
  sanitizeStringArray,
  sanitizeViewFilters,
} from "@/lib/api";
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
    return NextResponse.json(
      { error: "View name is required" },
      { status: 400 }
    );
  }

  const [last] = await db
    .select({ position: views.position })
    .from(views)
    .where(eq(views.projectId, projectId))
    .orderBy(desc(views.position))
    .limit(1);

  const query =
    typeof body.query === "string" ? body.query.slice(0, LIMITS.QUERY) : "";
  const filters = sanitizeViewFilters(body.filters);
  const hiddenStatusIds =
    sanitizeStringArray(body.hiddenStatusIds, 100, 64) ?? [];
  const swimlaneBy =
    typeof body.swimlaneBy === "string" && body.swimlaneBy.trim()
      ? body.swimlaneBy.trim().slice(0, 80)
      : "none";

  const viewId = crypto.randomUUID();
  await db.insert(views).values({
    id: viewId,
    projectId,
    name,
    layout: body.layout === "list" ? "list" : "board",
    query: encryptString(query),
    filters: encryptString(JSON.stringify(filters)),
    hiddenStatusIds: JSON.stringify(hiddenStatusIds),
    swimlaneBy,
    compact: Boolean(body.compact),
    position: last ? last.position + 1 : 0,
  });

  const [created] = await db.select().from(views).where(eq(views.id, viewId));
  return NextResponse.json(serializeView(created), { status: 201 });
}
