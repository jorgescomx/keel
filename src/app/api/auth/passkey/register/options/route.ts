import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { passkeys, webauthnChallenges } from "@/db/schema";
import { checkSameOrigin } from "@/lib/api";
import { getWebAuthnConfig, requireUser } from "@/lib/auth";

export async function POST(req: Request) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { rpName, rpID } = getWebAuthnConfig(req);
  const existingKeys = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, auth.user.id));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: auth.user.email,
    userDisplayName: auth.user.name,
    attestationType: "none",
    excludeCredentials: existingKeys.map((k) => {
      let transports: AuthenticatorTransport[] = [];
      try {
        transports = JSON.parse(k.transports);
      } catch {
        transports = [];
      }
      return { id: k.id, transports };
    }),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await db.insert(webauthnChallenges).values({
    id: challengeId,
    challenge: options.challenge,
    userId: auth.user.id,
    purpose: "register",
    expiresAt,
  });

  return NextResponse.json({ challengeId, options });
}
