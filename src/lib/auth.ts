import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import {
  users,
  sessions,
  projects,
  projectMembers,
  projectInvitations,
} from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import type { ProjectRole, User } from "@/types";

export const SESSION_COOKIE_NAME = "keel_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function hasMinRole(role: ProjectRole, minRole: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

async function isHttpsRequest(): Promise<boolean> {
  if (process.env.KEEL_COOKIE_SECURE === "true") return true;
  if (process.env.KEEL_COOKIE_SECURE === "false") return false;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim() === "https";
    const origin = h.get("origin");
    if (origin) return origin.startsWith("https://");
    const referer = h.get("referer");
    if (referer) return referer.startsWith("https://");
  } catch {
    // ignore outside request context
  }
  return false;
}

export async function createSession(userId: string): Promise<void> {
  await ensureDbReady();
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  });

  const secure = await isHttpsRequest();
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession(): Promise<void> {
  await ensureDbReady();
  const jar = await cookies();
  const rawToken = jar.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const tokenHash = sha256Hex(rawToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  jar.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  await ensureDbReady();
  const jar = await cookies();
  const rawToken = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const tokenHash = sha256Hex(rawToken);
  const nowIso = new Date().toISOString();

  const rows = await db
    .select({
      user: users,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, nowIso)))
    .limit(1);

  if (rows.length === 0) return null;

  const { user } = rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isMasterAdmin: Boolean(user.isMasterAdmin),
    createdAt: user.createdAt,
  };
}

export async function requireMasterAdmin(): Promise<
  { ok: true; user: User } | { ok: false; response: NextResponse }
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!auth.user.isMasterAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Master admin privileges required" },
        { status: 403 }
      ),
    };
  }
  return auth;
}

export async function requireUser(): Promise<
  { ok: true; user: User } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, user };
}

export async function getUserProjectRole(
  projectId: string,
  userId: string
): Promise<ProjectRole | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    )
    .limit(1);
  if (!row) return null;
  return row.role as ProjectRole;
}

export async function requireProjectAccess(
  projectId: string,
  minRole: ProjectRole = "viewer"
): Promise<
  | { ok: true; user: User; role: ProjectRole }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const role = await getUserProjectRole(projectId, auth.user.id);
  if (!role) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      ),
    };
  }

  if (!hasMinRole(role, minRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Requires ${minRole} role or higher` },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user: auth.user, role };
}

/**
 * When the very first user registers on an existing local Keel DB,
 * assign them as owner of any legacy projects that have no members yet.
 */
export async function claimUnownedProjects(userId: string): Promise<void> {
  const allProjects = await db.select({ id: projects.id }).from(projects);
  const allMembers = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers);
  const ownedProjectIds = new Set(allMembers.map((m) => m.projectId));

  const now = new Date().toISOString();
  for (const p of allProjects) {
    if (!ownedProjectIds.has(p.id)) {
      await db.insert(projectMembers).values({
        id: crypto.randomUUID(),
        projectId: p.id,
        userId,
        role: "owner",
        createdAt: now,
      });
    }
  }
}

/**
 * Accepts a pending project invitation token for `userId`.
 */
export async function acceptInvitationByToken(
  token: string,
  userId: string
): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const nowIso = new Date().toISOString();
  const [invite] = await db
    .select()
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.token, token),
        isNull(projectInvitations.acceptedAt),
        gt(projectInvitations.expiresAt, nowIso)
      )
    )
    .limit(1);

  if (!invite) {
    return { ok: false, error: "Invitation is invalid or has expired" };
  }

  const existing = await getUserProjectRole(invite.projectId, userId);
  if (!existing) {
    await db.insert(projectMembers).values({
      id: crypto.randomUUID(),
      projectId: invite.projectId,
      userId,
      role: invite.role,
      createdAt: nowIso,
    });
  }

  await db
    .update(projectInvitations)
    .set({ acceptedAt: nowIso })
    .where(eq(projectInvitations.id, invite.id));

  return { ok: true, projectId: invite.projectId };
}

/**
 * Derives WebAuthn RP ID & Origin from the incoming request headers so passkeys
 * work seamlessly on localhost and any HTTPS deployment domain.
 */
export function getWebAuthnConfig(req: Request): {
  rpName: string;
  rpID: string;
  expectedOrigin: string;
} {
  const originHeader = req.headers.get("origin");
  if (originHeader) {
    try {
      const url = new URL(originHeader);
      return {
        rpName: "Keel",
        rpID: url.hostname,
        expectedOrigin: url.origin,
      };
    } catch {
      // fall through
    }
  }

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3001";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const hostname = host.split(":")[0];
  return {
    rpName: "Keel",
    rpID: hostname,
    expectedOrigin: `${proto}://${host}`,
  };
}
