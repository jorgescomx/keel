import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { passkeys } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";

export async function GET() {
  await ensureDbReady();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null, passkeys: [] });
  }

  const keys = await db
    .select({
      id: passkeys.id,
      deviceName: passkeys.deviceName,
      createdAt: passkeys.createdAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, user.id))
    .orderBy(asc(passkeys.createdAt));

  return NextResponse.json({
    user,
    passkeys: keys,
    encryptionActive: isEncryptionConfigured(),
  });
}
