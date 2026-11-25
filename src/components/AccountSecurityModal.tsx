"use client";

import React, { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import {
  X,
  KeyRound,
  ShieldCheck,
  Trash2,
  LogOut,
  Plus,
  Loader2,
  Lock,
} from "lucide-react";
import type { PasskeyInfo, User } from "@/types";

interface AccountSecurityModalProps {
  user: User;
  onClose: () => void;
}

export function AccountSecurityModal({
  user,
  onClose,
}: AccountSecurityModalProps) {
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [encryptionActive, setEncryptionActive] = useState(true);
  const [deviceName, setDeviceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.passkeys)) setPasskeys(data.passkeys);
        if (typeof data.encryptionActive === "boolean") {
          setEncryptionActive(data.encryptionActive);
        }
      })
      .catch(() => {});
  }, []);

  const handleAddPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatusMsg("");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        `Passkeys require HTTPS or http://localhost. You are currently on ${window.location.origin} (plain HTTP).`
      );
      return;
    }
    setLoading(true);
    try {
      const optRes = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        setError(optData.error ?? "Failed to initialize passkey registration");
        return;
      }

      const credential = await startRegistration({
        optionsJSON: optData.options,
      });

      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: optData.challengeId,
          deviceName: deviceName.trim() || "This Device",
          credential,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error ?? "Passkey registration failed");
        return;
      }

      setPasskeys((prev) => [...prev, verifyData.passkey]);
      setDeviceName("");
      setStatusMsg("Passkey registered! You can now sign in passwordlessly.");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey prompt was cancelled.");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Passkeys require localhost or an HTTPS domain."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    await fetch(`/api/auth/passkey/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setPasskeys((prev) => prev.filter((k) => k.id !== id));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onClose();
    window.location.assign("/login");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161922] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/70 dark:bg-[#1b1f2b]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Account &amp; Security
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Profile */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/60 dark:bg-[#11141d]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {user.name}
                </div>
                <div className="text-xs text-slate-500">{user.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-600 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>

          {/* Encryption at Rest status */}
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-3 text-xs">
            <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                Encryption at Rest:{" "}
                {encryptionActive ? "Active (AES-256-GCM)" : "Not Configured"}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                Card titles, descriptions, custom fields, comments, and saved
                queries are encrypted in SQLite using your key in{" "}
                <code className="font-mono">.env.local</code>.
              </p>
            </div>
          </div>

          {/* Passkeys */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Passkeys ({passkeys.length})
              </h3>
            </div>

            {error && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            {statusMsg && (
              <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                {statusMsg}
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      {pk.deviceName}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Added{" "}
                      {new Date(pk.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeletePasskey(pk.id)}
                    className="rounded p-1.5 text-slate-400 hover:text-red-500"
                    title="Remove passkey"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {passkeys.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">
                  No passkeys registered yet. Add Windows Hello, Touch ID, Face
                  ID, or a hardware security key below.
                </div>
              )}
            </div>

            <form onSubmit={handleAddPasskey} className="flex gap-2">
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Device label (e.g. Work Laptop, YubiKey)"
                className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add Passkey
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
