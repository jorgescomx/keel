import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { users } from "@/db/schema";
import { parseJsonBody, isUniqueConstraintError } from "@/lib/api";
import { requireMasterAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const auth = await requireMasterAdmin();
  if (!auth.ok) return auth.response;

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const isMasterAdmin = Boolean(body.isMasterAdmin);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db.insert(users).values({
      id: userId,
      email,
      name,
      passwordHash: hashPassword(password),
      isMasterAdmin,
      createdAt: now,
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { id: userId, email, name, isMasterAdmin, createdAt: now },
    { status: 201 }
  );
}
