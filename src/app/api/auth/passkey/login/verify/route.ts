import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
} from "@simplewebauthn/server";
import { and, eq, gt } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { passkeys, users, webauthnChallenges } from "@/db/schema";
import { parseJsonBody } from "@/lib/api";
import {
  acceptInvitationByToken,
  createSession,
  getWebAuthnConfig,
} from "@/lib/auth";

export async function POST(req: Request) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const challengeId =
    typeof body.challengeId === "string" ? body.challengeId : "";
  const inviteToken =
    typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";
  const credential = body.credential as AuthenticationResponseJSON | undefined;

  if (!challengeId || !credential?.id) {
    return NextResponse.json(
      { error: "Missing passkey authentication payload" },
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
        eq(webauthnChallenges.purpose, "login"),
        gt(webauthnChallenges.expiresAt, nowIso)
      )
    )
    .limit(1);

  if (!challengeRow) {
    return NextResponse.json(
      { error: "Login challenge expired or invalid" },
      { status: 400 }
    );
  }

  await db
    .delete(webauthnChallenges)
    .where(eq(webauthnChallenges.id, challengeId));

  const [keyRow] = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.id, credential.id))
    .limit(1);

  if (!keyRow) {
    return NextResponse.json(
      { error: "Passkey not recognized" },
      { status: 401 }
    );
  }

  const { rpID, expectedOrigin } = getWebAuthnConfig(req);
  let transports: AuthenticatorTransport[] = [];
  try {
    transports = JSON.parse(keyRow.transports);
  } catch {
    transports = [];
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: keyRow.id,
        publicKey: new Uint8Array(Buffer.from(keyRow.publicKey, "base64")),
        counter: keyRow.counter,
        transports,
      },
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: "Passkey verification failed" },
        { status: 401 }
      );
    }

    await db
      .update(passkeys)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(passkeys.id, keyRow.id));

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, keyRow.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Passkey login failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
