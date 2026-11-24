import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import { comments, items } from "@/db/schema";
import { serializeComment } from "@/db/serializers";
import { checkSameOrigin, LIMITS, parseJsonBody } from "@/lib/api";

type Params = { params: Promise<{ itemId: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureDbReady();
  const { itemId } = await params;

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
    .select({ id: items.id })
    .from(items)
    .where(eq(items.id, itemId));
  if (!itemRow) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

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

  const author =
    typeof body.author === "string" && body.author.trim()
      ? body.author.trim().slice(0, LIMITS.AUTHOR)
      : "You";

  const commentId = crypto.randomUUID();
  await db.insert(comments).values({
    id: commentId,
    itemId,
    author,
    body: text,
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
