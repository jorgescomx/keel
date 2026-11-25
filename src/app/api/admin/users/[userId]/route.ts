import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { sessions, users } from "@/db/schema";
import { checkSameOrigin, parseJsonBody } from "@/lib/api";
import { requireMasterAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const auth = await requireMasterAdmin();
  if (!auth.ok) return auth.response;

  const { userId } = await params;

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const patch: Partial<typeof users.$inferInsert> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 80);
  }

  let passwordChanged = false;
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    patch.passwordHash = hashPassword(body.password);
    passwordChanged = true;
  }

  if (typeof body.isMasterAdmin === "boolean") {
    if (!body.isMasterAdmin && target.isMasterAdmin) {
      const allAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.isMasterAdmin, true));
      if (allAdmins.length <= 1) {
        return NextResponse.json(
          { error: "At least one master admin is required" },
          { status: 400 }
        );
      }
    }
    patch.isMasterAdmin = body.isMasterAdmin;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, userId));
  }

  // Revoke active sessions if password was reset for another user
  if (passwordChanged && userId !== auth.user.id) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const auth = await requireMasterAdmin();
  if (!auth.ok) return auth.response;

  const { userId } = await params;

  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account while signed in" },
      { status: 400 }
    );
  }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.isMasterAdmin) {
    const allAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isMasterAdmin, true));
    if (allAdmins.length <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last master admin" },
        { status: 400 }
      );
    }
  }

  await db.delete(users).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
