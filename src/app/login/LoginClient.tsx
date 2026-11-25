"use client";

import React, { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Layers, KeyRound, ArrowRight, Loader2 } from "lucide-react";

interface LoginClientProps {
  isFirstRun: boolean;
  initialMode: "login" | "register";
  inviteToken: string;
}

export function LoginClient({
  isFirstRun,
  initialMode,
  inviteToken,
}: LoginClientProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const endpoint =
        mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mode === "register" ? name : undefined,
          email,
          password,
          inviteToken: inviteToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Authentication failed");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError("");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        `Passkeys require HTTPS or http://localhost. You are currently on ${window.location.origin} (plain HTTP).`
      );
      return;
    }
    setPasskeyLoading(true);
    try {
      const optRes = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.error ?? "Could not start passkey login");
        return;
      }

      const credential = await startAuthentication({
        optionsJSON: optData.options,
      });

      const verifyRes = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: optData.challengeId,
          credential,
          inviteToken: inviteToken || undefined,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error ?? "Passkey verification failed");
        return;
      }

      window.location.assign("/");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey prompt was cancelled.");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Passkey login requires localhost or HTTPS."
        );
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#f4f5f7] dark:bg-[#0f1117] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-slate-100 dark:border-slate-800/80">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
            <Layers className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {mode === "register"
              ? "Create your Keel account"
              : "Sign in to Keel"}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {inviteToken
              ? "Sign in or create an account to accept your project invitation."
              : mode === "register" && isFirstRun
                ? "Create your master admin account to get started."
                : "Customizable boards, swimlines, and project tracking."}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "register" && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="User"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                autoFocus={mode === "login"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retype your password"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === "register" ? "Create Account" : "Sign In"}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>

          {mode === "login" && (
            <>
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                <span className="mx-3 text-[11px] font-medium text-slate-400">
                  or
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              </div>

              <button
                type="button"
                disabled={passkeyLoading}
                onClick={handlePasskeyLogin}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1f2c] px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 transition-colors"
              >
                {passkeyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4 text-blue-500" />
                )}
                <span>Sign in with Passkey</span>
              </button>
            </>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setConfirmPassword("");
                    setError("");
                  }}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Create account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setConfirmPassword("");
                    setError("");
                  }}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
