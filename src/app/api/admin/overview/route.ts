import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db, ensureDbReady } from "@/db";
import {
  users,
  projects,
  projectMembers,
  passkeys,
  items,
} from "@/db/schema";
import { requireMasterAdmin } from "@/lib/auth";

export async function GET() {
  await ensureDbReady();
  const auth = await requireMasterAdmin();
  if (!auth.ok) return auth.response;

  const [userRows, projectRows, memberRows, passkeyRows, itemRows] =
    await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          isMasterAdmin: users.isMasterAdmin,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(asc(users.createdAt)),
      db
        .select({
          id: projects.id,
          name: projects.name,
          key: projects.key,
          color: projects.color,
          icon: projects.icon,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .orderBy(asc(projects.createdAt)),
      db.select().from(projectMembers),
      db.select({ userId: passkeys.userId }).from(passkeys),
      db.select({ projectId: items.projectId }).from(items),
    ]);

  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const passkeyCountByUser = new Map<string, number>();
  for (const pk of passkeyRows) {
    passkeyCountByUser.set(
      pk.userId,
      (passkeyCountByUser.get(pk.userId) ?? 0) + 1
    );
  }

  const projectCountByUser = new Map<string, number>();
  for (const m of memberRows) {
    projectCountByUser.set(
      m.userId,
      (projectCountByUser.get(m.userId) ?? 0) + 1
    );
  }

  const itemCountByProject = new Map<string, number>();
  for (const i of itemRows) {
    itemCountByProject.set(
      i.projectId,
      (itemCountByProject.get(i.projectId) ?? 0) + 1
    );
  }

  const adminUsers = userRows.map((u) => ({
    ...u,
    isMasterAdmin: Boolean(u.isMasterAdmin),
    passkeyCount: passkeyCountByUser.get(u.id) ?? 0,
    projectCount: projectCountByUser.get(u.id) ?? 0,
  }));

  const adminProjects = projectRows.map((p) => ({
    ...p,
    itemCount: itemCountByProject.get(p.id) ?? 0,
    members: memberRows
      .filter((m) => m.projectId === p.id)
      .map((m) => {
        const u = userMap.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          role: m.role,
          name: u?.name ?? "Unknown",
          email: u?.email ?? "",
        };
      }),
  }));

  return NextResponse.json({
    users: adminUsers,
    projects: adminProjects,
  });
}
