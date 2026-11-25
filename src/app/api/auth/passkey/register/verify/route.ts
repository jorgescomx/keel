import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { and, eq, gt } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { passkeys, webauthnChallenges } from "@/db/schema";
import { parseJsonBody } from "@/lib/api";
import { getWebAuthnConfig, requireUser } from "@/lib/auth";

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const challengeId =
    typeof body.challengeId === "string" ? body.challengeId : "";
  const deviceName =
    typeof body.deviceName === "string" && body.deviceName.trim()
      ? body.deviceName.trim().slice(0, 60)
      : "Passkey";
  const credential = body.credential as RegistrationResponseJSON | undefined;

  if (!challengeId || !credential) {
    return NextResponse.json(
      { error: "Missing passkey registration payload" },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const [challengeRow] = await db
    .select()
    .from(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.id, challengeId),
        eq(webauthnChallenges.userId, auth.user.id),
        eq(webauthnChallenges.purpose, "register"),
        gt(webauthnChallenges.expiresAt, nowIso)
      )
    )
    .limit(1);

  if (!challengeRow) {
    return NextResponse.json(
      { error: "Registration challenge expired or invalid" },
      { status: 400 }
    );
  }

  // Consume challenge immediately (one-time use)
  await db
    .delete(webauthnChallenges)
    .where(eq(webauthnChallenges.id, challengeId));

  const { rpID, expectedOrigin } = getWebAuthnConfig(req);

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "Passkey verification failed" },
        { status: 400 }
      );
    }

    const { credential: cred } = verification.registrationInfo;
    const now = new Date().toISOString();

    await db.insert(passkeys).values({
      id: cred.id,
      userId: auth.user.id,
      publicKey: Buffer.from(cred.publicKey).toString("base64"),
      counter: cred.counter,
      transports: JSON.stringify(cred.transports ?? []),
      deviceName,
      createdAt: now,
    });

    return NextResponse.json(
      {
        passkey: { id: cred.id, deviceName, createdAt: now },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Passkey registration failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
