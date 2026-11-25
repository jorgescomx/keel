import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, ensureDbReady } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; mode?: string }>;
}) {
  await ensureDbReady();
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user && !params.invite) {
    redirect("/");
  }

  const [{ value: userCount }] = await db.select({ value: count() }).from(users);

  return (
    <LoginClient
      isFirstRun={userCount === 0}
      initialMode={params.mode === "register" ? "register" : "login"}
      inviteToken={params.invite ?? ""}
    />
  );
}
