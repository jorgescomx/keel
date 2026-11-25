import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { projectInvitations, projectMembers } from "@/db/schema";
import { checkSameOrigin, parseJsonBody } from "@/lib/api";
import { requireProjectAccess } from "@/lib/auth";
import type { ProjectRole } from "@/types";

type Params = { params: Promise<{ id: string; memberId: string }> };

const VALID_ROLES = new Set<ProjectRole>(["owner", "admin", "member", "viewer"]);

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const { id: projectId, memberId } = await params;

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const access = await requireProjectAccess(projectId, "admin");
  if (!access.ok) return access.response;

  const role = typeof body.role === "string" ? (body.role as ProjectRole) : null;
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only owners can promote to owner or modify an owner
  const [target] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.id, memberId),
        eq(projectMembers.projectId, projectId)
      )
    )
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if ((target.role === "owner" || role === "owner") && access.role !== "owner") {
    return NextResponse.json(
      { error: "Only a project owner can change owner roles" },
      { status: 403 }
    );
  }

  if (target.role === "owner" && role !== "owner") {
    const owners = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, "owner")
        )
      );
    if (owners.length <= 1) {
      return NextResponse.json(
        { error: "Project must have at least one owner" },
        { status: 400 }
      );
    }
  }

  await db
    .update(projectMembers)
    .set({ role })
    .where(eq(projectMembers.id, memberId));

  return NextResponse.json({ ok: true, role });
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { id: projectId, memberId } = await params;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");

  const access = await requireProjectAccess(projectId, "admin");
  if (!access.ok) return access.response;

  if (kind === "invite") {
    await db
      .delete(projectInvitations)
      .where(
        and(
          eq(projectInvitations.id, memberId),
          eq(projectInvitations.projectId, projectId)
        )
      );
    return NextResponse.json({ ok: true });
  }

  const [target] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.id, memberId),
        eq(projectMembers.projectId, projectId)
      )
    )
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.role === "owner") {
    if (access.role !== "owner") {
      return NextResponse.json(
        { error: "Only an owner can remove another owner" },
        { status: 403 }
      );
    }
    const owners = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, "owner")
        )
      );
    if (owners.length <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner of a project" },
        { status: 400 }
      );
    }
  }

  await db.delete(projectMembers).where(eq(projectMembers.id, memberId));
  return NextResponse.json({ ok: true });
}
