import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { users } from "@/db/schema";
import { parseJsonBody, isUniqueConstraintError } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import { acceptInvitationByToken, createSession } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteToken =
    typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "Please enter your name" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const [{ value: userCount }] = await db.select({ value: count() }).from(users);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const isFirstUser = userCount === 0;

  try {
    await db.insert(users).values({
      id: userId,
      email,
      name,
      passwordHash: hashPassword(password),
      isMasterAdmin: isFirstUser,
      createdAt: now,
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }

  // Accept invitation if user signed up via an invite link (otherwise starts as a blank slate)
  let joinedProjectId: string | null = null;
  if (inviteToken) {
    const res = await acceptInvitationByToken(inviteToken, userId);
    if (res.ok) joinedProjectId = res.projectId;
  }

  await createSession(userId);

  return NextResponse.json(
    {
      user: {
        id: userId,
        email,
        name,
        isMasterAdmin: isFirstUser,
        createdAt: now,
      },
      joinedProjectId,
    },
    { status: 201 }
  );
}
