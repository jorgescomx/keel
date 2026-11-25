import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/api";
import { clearSession } from "@/lib/auth";

export async function POST(req: Request) {
  const originError = checkSameOrigin(req);
  if (originError) return originError;

  await clearSession();
  return NextResponse.json({ ok: true });
}
