import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { passkeys } from "@/db/schema";
import { checkSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";

type Params = { params: Promise<{ credentialId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { credentialId } = await params;
  await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, credentialId), eq(passkeys.userId, auth.user.id)));

  return NextResponse.json({ ok: true });
}
