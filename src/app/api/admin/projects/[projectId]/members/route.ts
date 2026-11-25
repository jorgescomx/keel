import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { projectMembers } from "@/db/schema";
import { checkSameOrigin, parseJsonBody } from "@/lib/api";
import { requireMasterAdmin } from "@/lib/auth";
import type { ProjectRole } from "@/types";

type Params = { params: Promise<{ projectId: string }> };

const VALID_ROLES = new Set<ProjectRole>(["owner", "admin", "member", "viewer"]);

export async function POST(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const auth = await requireMasterAdmin();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const rawRole = typeof body.role === "string" ? body.role : "member";
  const role: ProjectRole = VALID_ROLES.has(rawRole as ProjectRole)
    ? (rawRole as ProjectRole)
    : "member";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(projectMembers)
      .set({ role })
      .where(eq(projectMembers.id, existing.id));
    return NextResponse.json({ ok: true, updated: true });
  }

  await db.insert(projectMembers).values({
    id: crypto.randomUUID(),
    projectId,
    userId,
    role,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, added: true }, { status: 201 });
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const auth = await requireMasterAdmin();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    );

  return NextResponse.json({ ok: true });
}
