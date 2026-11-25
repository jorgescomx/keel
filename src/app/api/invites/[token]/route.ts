import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { projectInvitations, projects, users } from "@/db/schema";
import { checkSameOrigin } from "@/lib/api";
import { acceptInvitationByToken, requireUser } from "@/lib/auth";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureDbReady();
  const { token } = await params;
  const nowIso = new Date().toISOString();

  const rows = await db
    .select({
      email: projectInvitations.email,
      role: projectInvitations.role,
      expiresAt: projectInvitations.expiresAt,
      projectName: projects.name,
      projectKey: projects.key,
      projectColor: projects.color,
      invitedByName: users.name,
    })
    .from(projectInvitations)
    .innerJoin(projects, eq(projectInvitations.projectId, projects.id))
    .innerJoin(users, eq(projectInvitations.invitedByUserId, users.id))
    .where(
      and(
        eq(projectInvitations.token, token),
        isNull(projectInvitations.acceptedAt),
        gt(projectInvitations.expiresAt, nowIso)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "This invitation link is invalid or has expired." },
      { status: 404 }
    );
  }

  return NextResponse.json(rows[0]);
}

export async function POST(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { token } = await params;
  const result = await acceptInvitationByToken(token, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, projectId: result.projectId });
}
