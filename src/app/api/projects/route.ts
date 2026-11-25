import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { projects, itemTypes, statuses, projectMembers } from "@/db/schema";
import { serializeProject } from "@/db/serializers";
import { DEFAULT_PROJECT_SETTINGS } from "@/types";
import {
  isUniqueConstraintError,
  LIMITS,
  parseJsonBody,
  sanitizeColor,
  sanitizeIcon,
} from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { encryptString } from "@/lib/crypto";

export async function GET() {
  await ensureDbReady();
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const rows = await db
    .select({ project: projects })
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, auth.user.id))
    .orderBy(asc(projects.createdAt));

  return NextResponse.json(rows.map((r) => serializeProject(r.project)));
}

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const name =
    typeof body.name === "string"
      ? body.name.trim().slice(0, LIMITS.NAME)
      : "";
  const rawKey =
    typeof body.key === "string"
      ? body.key
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 8)
      : "";

  if (!name || !rawKey) {
    return NextResponse.json(
      { error: "Project name and key are required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const nounSingular =
    typeof body.defaultNounSingular === "string" &&
    body.defaultNounSingular.trim()
      ? body.defaultNounSingular.trim().slice(0, 40)
      : "Task";
  const nounPlural =
    typeof body.defaultNounPlural === "string" && body.defaultNounPlural.trim()
      ? body.defaultNounPlural.trim().slice(0, 40)
      : `${nounSingular}s`;

  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, LIMITS.DESCRIPTION)
      : "";

  const settings = {
    ...DEFAULT_PROJECT_SETTINGS,
    defaultNounSingular: nounSingular,
    defaultNounPlural: nounPlural,
  };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: projectId,
        name,
        key: rawKey,
        description: encryptString(description),
        icon: sanitizeIcon(body.icon, "Layers"),
        color: sanitizeColor(body.color, "#3b82f6"),
        itemCounter: 0,
        settings: JSON.stringify(settings),
        createdAt: now,
        updatedAt: now,
      });

      // Creator becomes owner of the project
      await tx.insert(projectMembers).values({
        id: crypto.randomUUID(),
        projectId,
        userId: auth.user.id,
        role: "owner",
        createdAt: now,
      });

      // Seed starter item types (no "Issue"!)
      await tx.insert(itemTypes).values([
        {
          id: crypto.randomUUID(),
          projectId,
          name: "Feature",
          pluralName: "Features",
          icon: "Sparkles",
          color: "#10b981",
          level: 1,
          position: 0,
        },
        {
          id: crypto.randomUUID(),
          projectId,
          name: nounSingular,
          pluralName: nounPlural,
          icon: "CheckSquare",
          color: "#3b82f6",
          level: 2,
          position: 1,
        },
        {
          id: crypto.randomUUID(),
          projectId,
          name: "Defect",
          pluralName: "Defects",
          icon: "Bug",
          color: "#ef4444",
          level: 2,
          position: 2,
        },
      ]);

      // Seed starter Kanban columns
      await tx.insert(statuses).values([
        {
          id: crypto.randomUUID(),
          projectId,
          name: "Backlog",
          category: "backlog",
          color: "#64748b",
          position: 0,
          wipLimit: null,
        },
        {
          id: crypto.randomUUID(),
          projectId,
          name: "To Do",
          category: "todo",
          color: "#3b82f6",
          position: 1,
          wipLimit: null,
        },
        {
          id: crypto.randomUUID(),
          projectId,
          name: "In Progress",
          category: "in_progress",
          color: "#f59e0b",
          position: 2,
          wipLimit: null,
        },
        {
          id: crypto.randomUUID(),
          projectId,
          name: "Done",
          category: "done",
          color: "#10b981",
          position: 3,
          wipLimit: null,
        },
      ]);
    });
  } catch (err: unknown) {
    console.error("Failed to create project:", err);
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: "A project with that key already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }

  const created = await db.query.projects.findFirst({
    where: (p, { eq }) => eq(p.id, projectId),
  });

  return NextResponse.json(serializeProject(created!), { status: 201 });
}
