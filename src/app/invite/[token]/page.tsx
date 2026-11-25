"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Layers, Users, Check, Loader2, AlertCircle } from "lucide-react";

interface InvitePreview {
  email: string;
  role: string;
  projectName: string;
  projectKey: string;
  projectColor: string;
  invitedByName: string;
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [signedInUser, setSignedInUser] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/invites/${token}`).then(async (r) => ({
        ok: r.ok,
        data: await r.json(),
      })),
      fetch("/api/auth/me").then((r) => r.json()),
    ])
      .then(([invRes, meRes]) => {
        if (!invRes.ok) {
          setError(invRes.data.error ?? "Invalid invitation");
        } else {
          setInvite(invRes.data);
        }
        if (meRes?.user) {
          setSignedInUser(meRes.user);
        }
      })
      .catch(() => setError("Failed to load invitation"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/${token}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to accept invitation");
        return;
      }
      window.location.assign("/");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#f4f5f7] dark:bg-[#0f1117] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] shadow-xl p-6 text-center space-y-5">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
          <Layers className="h-6 w-6" />
        </div>

        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <div>
              <Link
                href="/"
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Go to Keel
              </Link>
            </div>
          </div>
        ) : invite ? (
          <>
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                <Users className="h-3.5 w-3.5" />
                Project Invitation
              </div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Join {invite.projectName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <strong>{invite.invitedByName}</strong> invited{" "}
                <span className="font-mono">{invite.email}</span> to join{" "}
                <strong>
                  {invite.projectName} ({invite.projectKey})
                </strong>{" "}
                as a <strong className="capitalize">{invite.role}</strong>.
              </p>
            </div>

            {signedInUser ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Signed in as <strong>{signedInUser.name}</strong> (
                  {signedInUser.email})
                </p>
                <button
                  type="button"
                  disabled={accepting}
                  onClick={handleAccept}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Accept &amp; Join Project
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Link
                  href={`/login?mode=register&invite=${encodeURIComponent(token)}`}
                  className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Create Account &amp; Join
                </Link>
                <Link
                  href={`/login?mode=login&invite=${encodeURIComponent(token)}`}
                  className="w-full inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Sign In to Existing Account
                </Link>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
