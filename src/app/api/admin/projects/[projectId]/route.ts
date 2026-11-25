import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import {
  comments,
  customFields,
  items,
  itemTypes,
  projectInvitations,
  projectMembers,
  projects,
  statuses,
  views,
} from "@/db/schema";
import { checkSameOrigin } from "@/lib/api";
import { requireMasterAdmin } from "@/lib/auth";

type Params = { params: Promise<{ projectId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  await ensureDbReady();
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  const auth = await requireMasterAdmin();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;

  await db.transaction(async (tx) => {
    const projectItems = await tx
      .select({ id: items.id })
      .from(items)
      .where(eq(items.projectId, projectId));

    if (projectItems.length > 0) {
      await tx
        .delete(comments)
        .where(inArray(comments.itemId, projectItems.map((i) => i.id)));
    }

    await tx.delete(items).where(eq(items.projectId, projectId));
    await tx.delete(views).where(eq(views.projectId, projectId));
    await tx.delete(customFields).where(eq(customFields.projectId, projectId));
    await tx.delete(statuses).where(eq(statuses.projectId, projectId));
    await tx.delete(itemTypes).where(eq(itemTypes.projectId, projectId));
    await tx
      .delete(projectInvitations)
      .where(eq(projectInvitations.projectId, projectId));
    await tx
      .delete(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));
  });

  return NextResponse.json({ ok: true });
}
