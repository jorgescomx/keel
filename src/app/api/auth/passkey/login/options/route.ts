import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { passkeys, users, webauthnChallenges } from "@/db/schema";
import { parseJsonBody } from "@/lib/api";
import { getWebAuthnConfig } from "@/lib/auth";

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const { rpID } = getWebAuthnConfig(req);

  let allowCredentials:
    | { id: string; transports?: AuthenticatorTransport[] }[]
    | undefined;
  let userId: string | null = null;

  if (email) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (user) {
      userId = user.id;
      const keys = await db
        .select()
        .from(passkeys)
        .where(eq(passkeys.userId, user.id));
      if (keys.length > 0) {
        allowCredentials = keys.map((k) => {
          let transports: AuthenticatorTransport[] = [];
          try {
            transports = JSON.parse(k.transports);
          } catch {
            transports = [];
          }
          return { id: k.id, transports };
        });
      }
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials,
  });

  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await db.insert(webauthnChallenges).values({
    id: challengeId,
    challenge: options.challenge,
    userId,
    purpose: "login",
    expiresAt,
  });

  return NextResponse.json({ challengeId, options });
}
