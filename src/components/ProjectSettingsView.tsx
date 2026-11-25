"use client";

import React, { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Settings2,
  Tags,
  Columns3,
  Sliders,
  LayoutGrid,
  Check,
  Users,
  Copy,
  Mail,
} from "lucide-react";
import type {
  CustomFieldType,
  ProjectBundle,
  ProjectInvitation,
  ProjectMember,
  ProjectRole,
  ProjectSettings,
  SelectOption,
  StatusCategory,
} from "@/types";
import { COLOR_PALETTE, DynamicIcon, ICON_NAMES } from "@/lib/icons";
import { HIERARCHY_LEVELS } from "@/lib/hierarchy";
import { cn } from "@/lib/utils";

interface ProjectSettingsViewProps {
  bundle: ProjectBundle;
  canDeleteProject: boolean;
  onRefresh: () => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}

type SettingsTab = "general" | "types" | "columns" | "fields" | "cards" | "members";

export function ProjectSettingsView({
  bundle,
  canDeleteProject,
  onRefresh,
  onDeleteProject,
}: ProjectSettingsViewProps) {
  const { project, itemTypes, statuses, customFields } = bundle;
  const [tab, setTab] = useState<SettingsTab>("general");
  const [savedNotice, setSavedNotice] = useState("");

  // General form state
  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [description, setDescription] = useState(project.description);
  const [icon, setIcon] = useState(project.icon);
  const [color, setColor] = useState(project.color);
  const [nounSingular, setNounSingular] = useState(
    project.settings.defaultNounSingular
  );
  const [nounPlural, setNounPlural] = useState(
    project.settings.defaultNounPlural
  );

  // New Item Type state
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypePlural, setNewTypePlural] = useState("");
  const [newTypeIcon, setNewTypeIcon] = useState("Bookmark");
  const [newTypeColor, setNewTypeColor] = useState("#6366f1");
  const [newTypeLevel, setNewTypeLevel] = useState<number>(3);

  // New Status / Column state
  const [newColName, setNewColName] = useState("");
  const [newColCategory, setNewColCategory] = useState<StatusCategory>("todo");
  const [newColColor, setNewColColor] = useState("#3b82f6");
  const [newColWip, setNewColWip] = useState("");

  // New Custom Field state
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("select");
  const [newFieldOptionsRaw, setNewFieldOptionsRaw] = useState(
    "Option A, Option B, Option C"
  );
  const [newFieldShowOnCard, setNewFieldShowOnCard] = useState(true);

  // Members & Invitations state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("member");
  const [inviteError, setInviteError] = useState("");
  const [latestInviteUrl, setLatestInviteUrl] = useState("");
  const [copiedToken, setCopiedToken] = useState("");

  const canManageMembers =
    bundle.myRole === "owner" || bundle.myRole === "admin";

  const loadMembers = async () => {
    const res = await fetch(`/api/projects/${project.id}/members`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members ?? []);
      setInvitations(data.invitations ?? []);
    }
  };

  useEffect(() => {
    if (tab === "members") {
      loadMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, project.id]);

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    setLatestInviteUrl("");
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setInviteError(data.error ?? "Failed to invite user");
      return;
    }
    setInviteEmail("");
    if (data.status === "invited" && data.invitation?.token) {
      const url = `${window.location.origin}/invite/${data.invitation.token}`;
      setLatestInviteUrl(url);
      flashSaved("Invite link created");
    } else {
      flashSaved("Member added to project");
    }
    await loadMembers();
  };

  const handleChangeMemberRole = async (memberId: string, role: ProjectRole) => {
    const res = await fetch(`/api/projects/${project.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      flashSaved("Role updated");
      await loadMembers();
    } else {
      const d = await res.json();
      setInviteError(d.error ?? "Could not change role");
    }
  };

  const handleRemoveMember = async (memberId: string, isInvite = false) => {
    const res = await fetch(
      `/api/projects/${project.id}/members/${memberId}${isInvite ? "?kind=invite" : ""}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      flashSaved(isInvite ? "Invitation revoked" : "Member removed");
      await loadMembers();
    } else {
      const d = await res.json();
      setInviteError(d.error ?? "Could not remove");
    }
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(""), 2000);
    } catch {
      setLatestInviteUrl(url);
    }
  };

  const flashSaved = (msg = "Saved") => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(""), 1800);
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        key,
        description,
        icon,
        color,
        settings: {
          defaultNounSingular: nounSingular.trim() || "Item",
          defaultNounPlural: nounPlural.trim() || "Items",
        },
      }),
    });
    await onRefresh();
    flashSaved("Project settings updated");
  };

  const handleToggleCardField = async (
    field: keyof ProjectSettings["cardFields"]
  ) => {
    const next = !project.settings.cardFields[field];
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          cardFields: { [field]: next },
        },
      }),
    });
    await onRefresh();
    flashSaved("Card layout updated");
  };

  const handleToggleEnforceHierarchy = async () => {
    const next = !project.settings.enforceHierarchy;
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: { enforceHierarchy: next },
      }),
    });
    await onRefresh();
    flashSaved(
      next ? "Strict hierarchy enabled" : "Flexible hierarchy enabled"
    );
  };

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    await fetch(`/api/projects/${project.id}/types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTypeName.trim(),
        pluralName: newTypePlural.trim() || `${newTypeName.trim()}s`,
        icon: newTypeIcon,
        color: newTypeColor,
        level: newTypeLevel,
      }),
    });
    setNewTypeName("");
    setNewTypePlural("");
    await onRefresh();
    flashSaved("Item type added");
  };

  const handleUpdateType = async (
    typeId: string,
    patch: Record<string, unknown>
  ) => {
    await fetch(`/api/projects/${project.id}/types/${typeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await onRefresh();
  };

  const handleDeleteType = async (typeId: string) => {
    const res = await fetch(`/api/projects/${project.id}/types/${typeId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await onRefresh();
      flashSaved("Item type removed");
    }
  };

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    await fetch(`/api/projects/${project.id}/statuses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newColName.trim(),
        category: newColCategory,
        color: newColColor,
        wipLimit: newColWip ? Number(newColWip) : null,
      }),
    });
    setNewColName("");
    setNewColWip("");
    await onRefresh();
    flashSaved("Column added");
  };

  const handleUpdateColumn = async (
    statusId: string,
    patch: Record<string, unknown>
  ) => {
    await fetch(`/api/projects/${project.id}/statuses/${statusId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await onRefresh();
  };

  const handleMoveColumn = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= statuses.length) return;
    const ordered = [...statuses];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    await fetch(`/api/projects/${project.id}/statuses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: ordered.map((s) => s.id) }),
    });
    await onRefresh();
  };

  const handleDeleteColumn = async (statusId: string) => {
    const res = await fetch(
      `/api/projects/${project.id}/statuses/${statusId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      await onRefresh();
      flashSaved("Column removed");
    }
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    const options: SelectOption[] =
      newFieldType === "select" || newFieldType === "multi_select"
        ? newFieldOptionsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((label, idx) => ({
              id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              label,
              color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
            }))
        : [];

    await fetch(`/api/projects/${project.id}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFieldName.trim(),
        fieldType: newFieldType,
        options,
        applicableTypeIds: [],
        showOnCard: newFieldShowOnCard,
      }),
    });
    setNewFieldName("");
    await onRefresh();
    flashSaved("Custom field created");
  };

  const handleUpdateField = async (
    fieldId: string,
    patch: Record<string, unknown>
  ) => {
    await fetch(`/api/projects/${project.id}/fields/${fieldId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await onRefresh();
  };

  const handleDeleteField = async (fieldId: string) => {
    await fetch(`/api/projects/${project.id}/fields/${fieldId}`, {
      method: "DELETE",
    });
    await onRefresh();
    flashSaved("Custom field deleted");
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "general",
      label: "General & Vocabulary",
      icon: <Settings2 className="h-4 w-4" />,
    },
    { id: "types", label: "Item Types", icon: <Tags className="h-4 w-4" /> },
    {
      id: "columns",
      label: "Columns & Workflow",
      icon: <Columns3 className="h-4 w-4" />,
    },
    {
      id: "fields",
      label: "Custom Fields",
      icon: <Sliders className="h-4 w-4" />,
    },
    {
      id: "cards",
      label: "Card Display",
      icon: <LayoutGrid className="h-4 w-4" />,
    },
    {
      id: "members",
      label: "Members & Invites",
      icon: <Users className="h-4 w-4" />,
    },
  ];

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Customize {project.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tailor terminology, work item types, Kanban columns, and custom
              fields directly—no rigid schemes required.
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              {savedNotice}
            </span>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px",
                tab === t.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: GENERAL & VOCABULARY */}
        {tab === "general" && (
          <form
            onSubmit={handleSaveGeneral}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] p-5 space-y-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Key Prefix
                </label>
                <input
                  type="text"
                  maxLength={8}
                  value={key}
                  onChange={(e) =>
                    setKey(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                    )
                  }
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 font-mono text-sm uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-lg bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200/70 dark:border-blue-900/50 p-4 space-y-3">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Custom Vocabulary (No Forced &ldquo;Issues&rdquo;)
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Choose what Keel calls your work items in buttons, headers,
                and counts for this project.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Singular (e.g. Task, Deliverable, Card)
                  </label>
                  <input
                    type="text"
                    value={nounSingular}
                    onChange={(e) => setNounSingular(e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Plural (e.g. Tasks, Deliverables, Cards)
                  </label>
                  <input
                    type="text"
                    value={nounPlural}
                    onChange={(e) => setNounPlural(e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Project Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full",
                        color === c &&
                          "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-[#161922]"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Project Icon
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_NAMES.slice(0, 12).map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={cn(
                        "h-7 w-7 rounded flex items-center justify-center border",
                        icon === ic
                          ? "border-blue-500 bg-blue-500/10 text-blue-600"
                          : "border-slate-200 dark:border-slate-700 text-slate-500"
                      )}
                    >
                      <DynamicIcon name={ic} className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              {canDeleteProject ? (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete project "${project.name}" and all its items?`
                      )
                    ) {
                      onDeleteProject(project.id);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Project
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: ITEM TYPES & HIERARCHY */}
        {tab === "types" && (
          <div className="space-y-4">
            {/* Hierarchy Mode & Live Preview */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Hierarchy & Tiers
                  </div>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                    Assign each type a tier (Level 1 = top). Adding a sub-item
                    automatically picks the next tier down.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#11141d] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(project.settings.enforceHierarchy)}
                    onChange={handleToggleEnforceHierarchy}
                    className="h-3.5 w-3.5 rounded text-blue-600"
                  />
                  <span>
                    {project.settings.enforceHierarchy
                      ? "Enforced (higher tier parents lower)"
                      : "Flexible (any item can parent any)"}
                  </span>
                </label>
              </div>

              {/* Live Tier Preview */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {[1, 2, 3, 4, 5].map((lvl) => {
                  const atLevel = itemTypes.filter((t) => t.level === lvl);
                  if (atLevel.length === 0) return null;
                  return (
                    <React.Fragment key={lvl}>
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-[#1b1f2b] px-2.5 py-1">
                        <span className="font-mono text-[10px] font-bold text-slate-400">
                          L{lvl}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {atLevel.map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 text-xs font-semibold"
                              style={{ color: t.color }}
                            >
                              <DynamicIcon
                                name={t.icon}
                                className="h-3 w-3"
                              />
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-slate-300 dark:text-slate-600 last:hidden text-xs">
                        →
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] divide-y divide-slate-100 dark:divide-slate-800">
              {[...itemTypes]
                .sort((a, b) => a.level - b.level || a.position - b.position)
                .map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 p-3.5"
                >
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                    style={{
                      backgroundColor: `${t.color}1c`,
                      color: t.color,
                    }}
                  >
                    <DynamicIcon name={t.icon} className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    defaultValue={t.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== t.name) {
                        handleUpdateType(t.id, { name: e.target.value.trim() });
                      }
                    }}
                    className="w-32 rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    defaultValue={t.pluralName}
                    onBlur={(e) => {
                      if (
                        e.target.value.trim() &&
                        e.target.value !== t.pluralName
                      ) {
                        handleUpdateType(t.id, {
                          pluralName: e.target.value.trim(),
                        });
                      }
                    }}
                    placeholder="Plural"
                    className="w-32 rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1 text-xs text-slate-500"
                  />
                  <select
                    value={t.level}
                    onChange={(e) =>
                      handleUpdateType(t.id, { level: Number(e.target.value) })
                    }
                    title="Hierarchy tier"
                    className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400"
                  >
                    {HIERARCHY_LEVELS.map((h) => (
                      <option key={h.level} value={h.level}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={t.icon}
                    onChange={(e) =>
                      handleUpdateType(t.id, { icon: e.target.value })
                    }
                    className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2 py-1 text-xs"
                  >
                    {ICON_NAMES.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic}
                      </option>
                    ))}
                  </select>
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) =>
                      handleUpdateType(t.id, { color: e.target.value })
                    }
                    className="h-7 w-8 cursor-pointer rounded border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                  <button
                    type="button"
                    disabled={itemTypes.length <= 1}
                    onClick={() => handleDeleteType(t.id)}
                    className="ml-auto rounded p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30"
                    title="Delete item type"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddType}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-[#161922]/70 p-4 flex flex-wrap items-end gap-3"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  New Type Name
                </label>
                <input
                  type="text"
                  required
                  value={newTypeName}
                  onChange={(e) => {
                    setNewTypeName(e.target.value);
                    setNewTypePlural(
                      e.target.value ? `${e.target.value}s` : ""
                    );
                  }}
                  placeholder="e.g. Epic, Sub-task, Spike"
                  className="w-36 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Plural
                </label>
                <input
                  type="text"
                  value={newTypePlural}
                  onChange={(e) => setNewTypePlural(e.target.value)}
                  placeholder="e.g. Sub-tasks"
                  className="w-32 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Tier / Level
                </label>
                <select
                  value={newTypeLevel}
                  onChange={(e) => setNewTypeLevel(Number(e.target.value))}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                >
                  {HIERARCHY_LEVELS.map((h) => (
                    <option key={h.level} value={h.level}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Icon
                </label>
                <select
                  value={newTypeIcon}
                  onChange={(e) => setNewTypeIcon(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                >
                  {ICON_NAMES.map((ic) => (
                    <option key={ic} value={ic}>
                      {ic}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newTypeColor}
                  onChange={(e) => setNewTypeColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-slate-200 dark:border-slate-700"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Type
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: COLUMNS & WORKFLOW */}
        {tab === "columns" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] divide-y divide-slate-100 dark:divide-slate-800">
              {statuses.map((s, idx) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 p-3.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveColumn(idx, -1)}
                      className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === statuses.length - 1}
                      onClick={() => handleMoveColumn(idx, 1)}
                      className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) =>
                      handleUpdateColumn(s.id, { color: e.target.value })
                    }
                    className="h-7 w-8 cursor-pointer rounded border border-slate-200 dark:border-slate-700"
                  />
                  <input
                    type="text"
                    defaultValue={s.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== s.name) {
                        handleUpdateColumn(s.id, {
                          name: e.target.value.trim(),
                        });
                      }
                    }}
                    className="w-40 rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1 text-xs font-semibold"
                  />
                  <select
                    value={s.category}
                    onChange={(e) =>
                      handleUpdateColumn(s.id, { category: e.target.value })
                    }
                    className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2 py-1 text-xs"
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>WIP Limit:</span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={s.wipLimit ?? ""}
                      placeholder="None"
                      onBlur={(e) =>
                        handleUpdateColumn(s.id, {
                          wipLimit:
                            e.target.value && Number(e.target.value) > 0
                              ? Number(e.target.value)
                              : null,
                        })
                      }
                      className="w-16 rounded border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={statuses.length <= 1}
                    onClick={() => handleDeleteColumn(s.id)}
                    className="ml-auto rounded p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddColumn}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-[#161922]/70 p-4 flex flex-wrap items-end gap-3"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Column Name
                </label>
                <input
                  type="text"
                  required
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. QA, Blocked, Deployed"
                  className="w-44 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Category
                </label>
                <select
                  value={newColCategory}
                  onChange={(e) =>
                    setNewColCategory(e.target.value as StatusCategory)
                  }
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                >
                  <option value="backlog">Backlog</option>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  WIP Limit
                </label>
                <input
                  type="number"
                  min={1}
                  value={newColWip}
                  onChange={(e) => setNewColWip(e.target.value)}
                  placeholder="Optional"
                  className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={newColColor}
                  onChange={(e) => setNewColColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-slate-200 dark:border-slate-700"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Column
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: CUSTOM FIELDS */}
        {tab === "fields" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] divide-y divide-slate-100 dark:divide-slate-800">
              {customFields.map((cf) => (
                <div
                  key={cf.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {cf.name}
                      </span>
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10.5px] font-mono uppercase text-slate-500">
                        {cf.fieldType}
                      </span>
                      {cf.fieldType === "select" && (
                        <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10.5px] font-medium text-blue-600 dark:text-blue-400">
                          Usable as Swimlane
                        </span>
                      )}
                    </div>
                    {cf.options.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {cf.options.map((o) => (
                          <span
                            key={o.id}
                            className="rounded px-1.5 py-0.5 text-[10.5px] font-medium border"
                            style={{
                              backgroundColor: `${o.color}18`,
                              borderColor: `${o.color}40`,
                              color: o.color,
                            }}
                          >
                            {o.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cf.showOnCard}
                        onChange={(e) =>
                          handleUpdateField(cf.id, {
                            showOnCard: e.target.checked,
                          })
                        }
                        className="h-3.5 w-3.5 rounded text-blue-600"
                      />
                      Show on card
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeleteField(cf.id)}
                      className="rounded p-1.5 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {customFields.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  No custom fields yet. Add one below (Select fields can also be
                  used as Kanban Swimlanes!).
                </div>
              )}
            </div>

            <form
              onSubmit={handleAddField}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-[#161922]/70 p-4 space-y-3"
            >
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Add Custom Field
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Field Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="e.g. Component, Effort, Client"
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Field Type
                  </label>
                  <select
                    value={newFieldType}
                    onChange={(e) =>
                      setNewFieldType(e.target.value as CustomFieldType)
                    }
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                  >
                    <option value="select">Single Select (Swimlane-ready)</option>
                    <option value="multi_select">Multi-Select</option>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="url">URL</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFieldShowOnCard}
                      onChange={(e) => setNewFieldShowOnCard(e.target.checked)}
                      className="h-4 w-4 rounded text-blue-600"
                    />
                    Show on Kanban cards
                  </label>
                </div>
              </div>

              {(newFieldType === "select" ||
                newFieldType === "multi_select") && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Options (comma separated)
                  </label>
                  <input
                    type="text"
                    value={newFieldOptionsRaw}
                    onChange={(e) => setNewFieldOptionsRaw(e.target.value)}
                    placeholder="Frontend, Backend, Mobile, Ops"
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                  />
                </div>
              )}

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Custom Field
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: CARD DISPLAY */}
        {tab === "cards" && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] p-5 space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Toggle which built-in badges appear on Kanban cards in this
              project.
            </p>
            {(
              [
                ["showKey", "Item Key (e.g. PLAT-12)"],
                ["showType", "Item Type Icon"],
                ["showPriority", "Priority Indicator"],
                ["showLabels", "Labels"],
                ["showDueDate", "Due Date"],
                ["showSubitemCount", "Sub-item Counter"],
                ["showParent", "Parent Breadcrumb"],
              ] as [keyof ProjectSettings["cardFields"], string][]
            ).map(([field, label]) => (
              <label
                key={field}
                className="flex items-center justify-between rounded-lg border border-slate-200/70 dark:border-slate-800 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1a1e2a]"
              >
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {label}
                </span>
                <input
                  type="checkbox"
                  checked={project.settings.cardFields[field]}
                  onChange={() => handleToggleCardField(field)}
                  className="h-4 w-4 rounded text-blue-600"
                />
              </label>
            ))}
          </div>
        )}

        {/* TAB 6: MEMBERS & INVITES */}
        {tab === "members" && (
          <div className="space-y-4">
            {inviteError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {inviteError}
              </div>
            )}

            {latestInviteUrl && (
              <div className="rounded-lg bg-blue-50/80 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-800 p-3.5 space-y-1.5">
                <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  Share this invitation link (valid for 7 days):
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={latestInviteUrl}
                    className="flex-1 rounded border border-blue-200 dark:border-blue-800 bg-white dark:bg-[#11141d] px-2.5 py-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(latestInviteUrl)}
                    className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                </div>
              </div>
            )}

            {canManageMembers && (
              <form
                onSubmit={handleInviteMember}
                className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-[#161922]/70 p-4 flex flex-wrap items-end gap-3"
              >
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Invite by Email
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2.5 py-1.5 text-xs"
                  >
                    <option value="member">Member (edit cards)</option>
                    <option value="admin">Admin (manage project)</option>
                    <option value="viewer">Viewer (read-only)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Add / Invite
                </button>
              </form>
            )}

            {/* Current Members */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Project Members ({members.length})
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 font-bold text-xs">
                        {m.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {m.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {m.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canManageMembers ? (
                        <select
                          value={m.role}
                          onChange={(e) =>
                            handleChangeMemberRole(
                              m.id,
                              e.target.value as ProjectRole
                            )
                          }
                          className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11141d] px-2 py-1 text-xs font-medium capitalize"
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600 dark:text-slate-300">
                          {m.role}
                        </span>
                      )}

                      {canManageMembers && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id, false)}
                          className="rounded p-1 text-slate-400 hover:text-red-500"
                          title="Remove member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161922] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pending Invitations ({invitations.length})
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {inv.email}
                        </span>
                        <span className="ml-2 rounded bg-amber-500/12 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400 capitalize">
                          {inv.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyInviteLink(inv.token)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedToken === inv.token ? "Copied!" : "Copy Link"}
                        </button>
                        {canManageMembers && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(inv.id, true)}
                            className="rounded p-1 text-slate-400 hover:text-red-500"
                            title="Revoke invitation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
