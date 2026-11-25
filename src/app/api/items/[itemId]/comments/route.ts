import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { comments, items } from "@/db/schema";
import { serializeComment } from "@/db/serializers";
import { checkSameOrigin, LIMITS, parseJsonBody } from "@/lib/api";
import { requireProjectAccess } from "@/lib/auth";
import { encryptString } from "@/lib/crypto";

type Params = { params: Promise<{ itemId: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureDbReady();
  const { itemId } = await params;

  const [itemRow] = await db
    .select({ id: items.id, projectId: items.projectId })
    .from(items)
    .where(eq(items.id, itemId));
  if (!itemRow) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(itemRow.projectId, "viewer");
  if (!access.ok) return access.response;

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.itemId, itemId))
    .orderBy(asc(comments.createdAt));

  return NextResponse.json(rows.map(serializeComment));
}

export async function POST(req: Request, { params }: Params) {
  await ensureDbReady();
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { itemId } = await params;

  const [itemRow] = await db
    .select({ id: items.id, projectId: items.projectId })
    .from(items)
    .where(eq(items.id, itemId));
  if (!itemRow) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(itemRow.projectId, "member");
  if (!access.ok) return access.response;

  const text =
    typeof body.body === "string"
      ? body.body.trim().slice(0, LIMITS.COMMENT)
      : "";
  if (!text) {
    return NextResponse.json(
      { error: "Comment cannot be empty" },
      { status: 400 }
    );
  }

  const author = access.user.name.slice(0, LIMITS.AUTHOR) || "User";

  const commentId = crypto.randomUUID();
  await db.insert(comments).values({
    id: commentId,
    itemId,
    author,
    body: encryptString(text),
    createdAt: new Date().toISOString(),
  });

  const [created] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId));

  return NextResponse.json(serializeComment(created), { status: 201 });
}

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const { itemId } = await params;

  const [itemRow] = await db
    .select({ id: items.id, projectId: items.projectId })
    .from(items)
    .where(eq(items.id, itemId));
  if (!itemRow) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(itemRow.projectId, "member");
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const commentId = searchParams.get("commentId");
  if (!commentId) {
    return NextResponse.json({ error: "commentId required" }, { status: 400 });
  }

  // Scope deletion to the specified itemId to prevent cross-item comment deletion
  await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.itemId, itemId)));

  return NextResponse.json({ ok: true });
}
