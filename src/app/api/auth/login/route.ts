import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { users } from "@/db/schema";
import { parseJsonBody } from "@/lib/api";
import { verifyPassword } from "@/lib/crypto";
import { acceptInvitationByToken, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteToken =
    typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  let joinedProjectId: string | null = null;
  if (inviteToken) {
    const res = await acceptInvitationByToken(inviteToken, user.id);
    if (res.ok) joinedProjectId = res.projectId;
  }

  await createSession(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isMasterAdmin: Boolean(user.isMasterAdmin),
      createdAt: user.createdAt,
    },
    joinedProjectId,
  });
}
