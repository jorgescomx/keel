import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import {
  projectInvitations,
  projectMembers,
  users,
} from "@/db/schema";
import { parseJsonBody } from "@/lib/api";
import { requireProjectAccess } from "@/lib/auth";
import type { ProjectRole } from "@/types";

type Params = { params: Promise<{ id: string }> };

const VALID_INVITE_ROLES = new Set<ProjectRole>(["admin", "member", "viewer"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(_req: Request, { params }: Params) {
  await ensureDbReady();
  const { id: projectId } = await params;

  const access = await requireProjectAccess(projectId, "viewer");
  if (!access.ok) return access.response;

  const memberRows = await db
    .select({
      id: projectMembers.id,
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      role: projectMembers.role,
      createdAt: projectMembers.createdAt,
      email: users.email,
      name: users.name,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));

  const nowIso = new Date().toISOString();
  const inviteRows = await db
    .select({
      id: projectInvitations.id,
      projectId: projectInvitations.projectId,
      email: projectInvitations.email,
      role: projectInvitations.role,
      token: projectInvitations.token,
      expiresAt: projectInvitations.expiresAt,
      createdAt: projectInvitations.createdAt,
    })
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.projectId, projectId),
        isNull(projectInvitations.acceptedAt),
        gt(projectInvitations.expiresAt, nowIso)
      )
    )
    .orderBy(asc(projectInvitations.createdAt));

  return NextResponse.json({
    members: memberRows,
    invitations: inviteRows,
  });
}

export async function POST(req: Request, { params }: Params) {
  await ensureDbReady();
  const { id: projectId } = await params;

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const access = await requireProjectAccess(projectId, "admin");
  if (!access.ok) return access.response;

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const rawRole = typeof body.role === "string" ? body.role : "member";
  const role: ProjectRole = VALID_INVITE_ROLES.has(rawRole as ProjectRole)
    ? (rawRole as ProjectRole)
    : "member";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Check if user already has an account
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    const [existingMember] = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, existingUser.id)
        )
      )
      .limit(1);

    if (existingMember) {
      return NextResponse.json(
        { error: "This user is already a member of the project" },
        { status: 409 }
      );
    }

    const memberId = crypto.randomUUID();
    await db.insert(projectMembers).values({
      id: memberId,
      projectId,
      userId: existingUser.id,
      role,
      createdAt: nowIso,
    });

    return NextResponse.json(
      {
        status: "added",
        member: {
          id: memberId,
          projectId,
          userId: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          role,
          createdAt: nowIso,
        },
      },
      { status: 201 }
    );
  }

  // User doesn't have an account yet — create a shareable invitation link (7 days)
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const inviteId = crypto.randomUUID();

  await db.insert(projectInvitations).values({
    id: inviteId,
    projectId,
    email,
    role,
    token,
    invitedByUserId: access.user.id,
    expiresAt,
    acceptedAt: null,
    createdAt: nowIso,
  });

  return NextResponse.json(
    {
      status: "invited",
      invitation: {
        id: inviteId,
        projectId,
        email,
        role,
        token,
        expiresAt,
        createdAt: nowIso,
      },
    },
    { status: 201 }
  );
}
