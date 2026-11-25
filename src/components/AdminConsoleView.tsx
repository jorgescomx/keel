"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Users,
  FolderKanban,
  Plus,
  Trash2,
  KeyRound,
  Check,
  UserPlus,
  X,
} from "lucide-react";
import type { ProjectRole, User } from "@/types";
import { DynamicIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  isMasterAdmin: boolean;
  passkeyCount: number;
  projectCount: number;
  createdAt: string;
}

interface AdminProjectMember {
  id: string;
  userId: string;
  role: ProjectRole;
  name: string;
  email: string;
}

interface AdminProjectRow {
  id: string;
  name: string;
  key: string;
  color: string;
  icon: string;
  itemCount: number;
  createdAt: string;
  members: AdminProjectMember[];
}

interface AdminConsoleViewProps {
  currentUser: User;
  onProjectsChanged: () => Promise<void>;
}

export function AdminConsoleView({
  currentUser,
  onProjectsChanged,
}: AdminConsoleViewProps) {
  const [tab, setTab] = useState<"users" | "projects">("users");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [projects, setProjects] = useState<AdminProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Add user form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  // Inline password reset
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  // Add member to project form (keyed by projectId)
  const [addMemberUserByProject, setAddMemberUserByProject] = useState<
    Record<string, string>
  >({});
  const [addMemberRoleByProject, setAddMemberRoleByProject] = useState<
    Record<string, ProjectRole>
  >({});

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2400);
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/overview");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load admin overview");
        return;
      }
      setUsers(data.users ?? []);
      setProjects(data.projects ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        email: newEmail,
        password: newPassword,
        isMasterAdmin: newIsAdmin,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create user");
      return;
    }
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewIsAdmin(false);
    flash("User created");
    await loadOverview();
  };

  const handleResetPassword = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to reset password");
      return;
    }
    setResetUserId(null);
    setResetPassword("");
    flash("Password updated");
  };

  const handleToggleAdmin = async (u: AdminUserRow) => {
    setError("");
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMasterAdmin: !u.isMasterAdmin }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not update admin status");
      return;
    }
    flash(
      !u.isMasterAdmin
        ? `${u.name} promoted to Master Admin`
        : `${u.name} removed from Master Admins`
    );
    await loadOverview();
  };

  const handleDeleteUser = async (u: AdminUserRow) => {
    if (
      !window.confirm(
        `Delete user "${u.name}" (${u.email})? This removes their account, sessions, passkeys, and project memberships.`
      )
    ) {
      return;
    }
    setError("");
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not delete user");
      return;
    }
    flash("User deleted");
    await loadOverview();
  };

  const handleAddUserToProject = async (projectId: string) => {
    const userId = addMemberUserByProject[projectId];
    if (!userId) return;
    const role = addMemberRoleByProject[projectId] ?? "member";
    setError("");
    const res = await fetch(`/api/admin/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) {
      setAddMemberUserByProject((prev) => ({ ...prev, [projectId]: "" }));
      flash("Project membership updated");
      await loadOverview();
      await onProjectsChanged();
    }
  };

  const handleRemoveUserFromProject = async (
    projectId: string,
    userId: string
  ) => {
    setError("");
    const res = await fetch(
      `/api/admin/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      flash("Removed user from project");
      await loadOverview();
      await onProjectsChanged();
    }
  };

  const handleDeleteProject = async (p: AdminProjectRow) => {
    if (
      !window.confirm(
        `Permanently delete project "${p.name}" (${p.key}) and all ${p.itemCount} items?`
      )
    ) {
      return;
    }
    setError("");
    const res = await fetch(`/api/admin/projects/${p.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      flash(`Project ${p.key} deleted`);
      await loadOverview();
      await onProjectsChanged();
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Master Admin Console
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage users, reset passwords, assign project memberships, and
                delete projects across Keel.
              </p>
            </div>
          </div>

          {notice && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              {notice}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3.5 py-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab("users")}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors",
              tab === "users"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Users className="h-4 w-4" />
            Users ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("projects")}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors",
              tab === "projects"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <FolderKanban className="h-4 w-4" />
            All Projects ({projects.length})
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Loading admin data...
          </div>
        ) : tab === "users" ? (
          <div className="space-y-4">
            {/* Add User Form */}
            <form
              onSubmit={handleCreateUser}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/75 dark:bg-[#161922]/75 p-4 space-y-3"
            >
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Add New User (Starts with a blank slate)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name (e.g. Alex)"
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
                />
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Temp password (8+ chars)"
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsAdmin}
                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-blue-600"
                  />
                  Grant Master Admin privileges
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create User
                </button>
              </div>
            </form>

            {/* Users List */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <div key={u.id} className="p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 text-xs font-bold">
                        {u.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {u.name}
                          </span>
                          {u.id === currentUser.id && (
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              You
                            </span>
                          )}
                          {u.isMasterAdmin && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              <Shield className="h-2.5 w-2.5" />
                              Master Admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {u.email} · {u.projectCount} project
                          {u.projectCount === 1 ? "" : "s"} · {u.passkeyCount}{" "}
                          passkey{u.passkeyCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setResetUserId(resetUserId === u.id ? null : u.id);
                          setResetPassword("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600"
                      >
                        <KeyRound className="h-3 w-3" />
                        Reset Password
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleAdmin(u)}
                        className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600"
                      >
                        {u.isMasterAdmin ? "Revoke Admin" : "Make Admin"}
                      </button>

                      {u.id !== currentUser.id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {resetUserId === u.id && (
                    <form
                      onSubmit={(e) => handleResetPassword(e, u.id)}
                      className="flex items-center gap-2 pl-11 pt-1"
                    >
                      <input
                        type="password"
                        required
                        minLength={8}
                        autoFocus
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        placeholder={`New password for ${u.name} (8+ chars)`}
                        className="w-64 rounded-md border border-blue-400 bg-white dark:bg-[#11141d] px-2.5 py-1 text-xs focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Save Password
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetUserId(null)}
                        className="rounded p-1 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* PROJECTS & ACCESS TAB */
          <div className="space-y-4">
            {projects.length === 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] p-8 text-center text-xs text-slate-500">
                No projects exist yet.
              </div>
            )}

            {projects.map((p) => {
              const memberUserIds = new Set(p.members.map((m) => m.userId));
              const availableUsers = users.filter(
                (u) => !memberUserIds.has(u.id)
              );

              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1b1f2b]/60">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white"
                        style={{ backgroundColor: p.color }}
                      >
                        <DynamicIcon name={p.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </span>
                      <span className="font-mono text-xs text-slate-400">
                        {p.key}
                      </span>
                      <span className="rounded-full bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        {p.itemCount} items
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteProject(p)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Project
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {p.members.map((m) => (
                        <div
                          key={m.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-[#11141d] px-2.5 py-1 text-xs"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {m.name}
                          </span>
                          <span className="text-[10.5px] uppercase font-mono text-blue-600 dark:text-blue-400">
                            {m.role}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveUserFromProject(p.id, m.userId)
                            }
                            className="text-slate-400 hover:text-red-500"
                            title={`Remove ${m.name} from ${p.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {p.members.length === 0 && (
                        <span className="text-xs text-slate-400">
                          No members assigned.
                        </span>
                      )}
                    </div>

                    {availableUsers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <select
                          value={addMemberUserByProject[p.id] ?? ""}
                          onChange={(e) =>
                            setAddMemberUserByProject((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1 text-xs"
                        >
                          <option value="">Add user to {p.key}...</option>
                          {availableUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.email})
                            </option>
                          ))}
                        </select>
                        <select
                          value={addMemberRoleByProject[p.id] ?? "member"}
                          onChange={(e) =>
                            setAddMemberRoleByProject((prev) => ({
                              ...prev,
                              [p.id]: e.target.value as ProjectRole,
                            }))
                          }
                          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2 py-1 text-xs"
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          disabled={!addMemberUserByProject[p.id]}
                          onClick={() => handleAddUserToProject(p.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-800 dark:bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
                        >
                          <UserPlus className="h-3 w-3" />
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
