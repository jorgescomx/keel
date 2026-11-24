import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, itemTypes, statuses } from "@/db/schema";
import type {
  CustomFieldType,
  Priority,
  ProjectSettings,
  SelectOption,
  StatusCategory,
  ViewFilters,
} from "@/types";

export const VALID_PRIORITIES = new Set<Priority>([
  "urgent",
  "high",
  "medium",
  "low",
  "none",
]);

export const VALID_STATUS_CATEGORIES = new Set<StatusCategory>([
  "backlog",
  "todo",
  "in_progress",
  "done",
]);

export const VALID_CUSTOM_FIELD_TYPES = new Set<CustomFieldType>([
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "url",
]);

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const ICON_NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const LIMITS = {
  NAME: 120,
  TITLE: 300,
  DESCRIPTION: 20_000,
  COMMENT: 10_000,
  AUTHOR: 80,
  QUERY: 2_000,
  LABEL: 64,
  MAX_LABELS: 50,
  MAX_OPTIONS: 50,
  MAX_REORDER_UPDATES: 500,
  MAX_CUSTOM_FIELD_KEYS: 100,
  MAX_BODY_BYTES: 256_000,
} as const;

/**
 * Verifies that state-changing requests originate from the same host
 * to defend against cross-site request forgery (CSRF), including against localhost.
 */
export function checkSameOrigin(req: Request): NextResponse | null {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
    return NextResponse.json(
      { error: "Cross-site requests are not allowed" },
      { status: 403 }
    );
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host) {
      return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
    }
    try {
      const originHost = new URL(origin).host;
      if (originHost.toLowerCase() !== host.toLowerCase()) {
        return NextResponse.json(
          { error: "Cross-origin requests are not allowed" },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  return null;
}

/**
 * Parses and validates a JSON request body:
 * - Enforces same-origin (CSRF defense)
 * - Enforces Content-Type: application/json
 * - Enforces body byte limit
 * - Ensures body is a plain JSON object
 */
export async function parseJsonBody(
  req: Request,
  maxBytes: number = LIMITS.MAX_BODY_BYTES
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const originError = checkSameOrigin(req);
  if (originError) return { ok: false, response: originError };

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Content-Type must be application/json" },
        { status: 415 }
      ),
    };
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      ),
    };
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Failed to read request body" },
        { status: 400 }
      ),
    };
  }

  if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      ),
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "JSON body must be an object" },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed as Record<string, unknown> };
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function sanitizeColor(val: unknown, fallback: string): string {
  if (typeof val === "string" && HEX_COLOR_RE.test(val.trim())) {
    return val.trim();
  }
  return fallback;
}

export function sanitizeIcon(val: unknown, fallback: string): string {
  if (typeof val === "string" && ICON_NAME_RE.test(val.trim())) {
    return val.trim();
  }
  return fallback;
}

export function sanitizeDueDate(val: unknown): string | null | undefined {
  if (val === null || val === "") return null;
  if (typeof val === "string" && ISO_DATE_RE.test(val.trim())) {
    return val.trim();
  }
  return undefined;
}

export function sanitizeStringArray(
  val: unknown,
  maxItems: number,
  maxItemLen: number
): string[] | null {
  if (!Array.isArray(val)) return null;
  const out: string[] = [];
  for (const entry of val.slice(0, maxItems)) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().slice(0, maxItemLen);
    if (trimmed) out.push(trimmed);
  }
  return out;
}

export function sanitizeSelectOptions(val: unknown): SelectOption[] | null {
  if (!Array.isArray(val)) return null;
  const out: SelectOption[] = [];
  for (const entry of val.slice(0, LIMITS.MAX_OPTIONS)) {
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === "string" ? entry.id.trim().slice(0, 64) : "";
    const label =
      typeof entry.label === "string" ? entry.label.trim().slice(0, 80) : "";
    if (!id || !label) continue;
    out.push({
      id,
      label,
      color: sanitizeColor(entry.color, "#64748b"),
    });
  }
  return out;
}

export function sanitizeCustomFieldValues(
  val: unknown
): Record<string, unknown> | null {
  if (!isPlainObject(val)) return null;
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(val)) {
    if (count >= LIMITS.MAX_CUSTOM_FIELD_KEYS) break;
    if (FORBIDDEN_KEYS.has(k) || k.length === 0 || k.length > 64) continue;
    if (
      v === null ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v))
    ) {
      out[k] = v;
      count++;
    } else if (typeof v === "string") {
      out[k] = v.slice(0, 2_000);
      count++;
    } else if (Array.isArray(v)) {
      out[k] = v
        .slice(0, LIMITS.MAX_OPTIONS)
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.slice(0, 120));
      count++;
    }
  }
  return out;
}

export function mergeProjectSettings(
  current: ProjectSettings,
  rawPatch: unknown
): ProjectSettings {
  if (!isPlainObject(rawPatch)) return current;

  const nextCardFields: ProjectSettings["cardFields"] = {
    ...current.cardFields,
  };
  if (isPlainObject(rawPatch.cardFields)) {
    const cf = rawPatch.cardFields;
    if (typeof cf.showKey === "boolean") nextCardFields.showKey = cf.showKey;
    if (typeof cf.showType === "boolean") nextCardFields.showType = cf.showType;
    if (typeof cf.showPriority === "boolean") {
      nextCardFields.showPriority = cf.showPriority;
    }
    if (typeof cf.showLabels === "boolean") {
      nextCardFields.showLabels = cf.showLabels;
    }
    if (typeof cf.showDueDate === "boolean") {
      nextCardFields.showDueDate = cf.showDueDate;
    }
    if (typeof cf.showSubitemCount === "boolean") {
      nextCardFields.showSubitemCount = cf.showSubitemCount;
    }
    if (typeof cf.showParent === "boolean") {
      nextCardFields.showParent = cf.showParent;
    }
  }

  return {
    defaultNounSingular:
      typeof rawPatch.defaultNounSingular === "string" &&
      rawPatch.defaultNounSingular.trim()
        ? rawPatch.defaultNounSingular.trim().slice(0, 40)
        : current.defaultNounSingular,
    defaultNounPlural:
      typeof rawPatch.defaultNounPlural === "string" &&
      rawPatch.defaultNounPlural.trim()
        ? rawPatch.defaultNounPlural.trim().slice(0, 40)
        : current.defaultNounPlural,
    defaultSwimlane:
      typeof rawPatch.defaultSwimlane === "string" &&
      rawPatch.defaultSwimlane.trim()
        ? rawPatch.defaultSwimlane.trim().slice(0, 80)
        : current.defaultSwimlane,
    enforceHierarchy:
      typeof rawPatch.enforceHierarchy === "boolean"
        ? rawPatch.enforceHierarchy
        : current.enforceHierarchy,
    cardFields: nextCardFields,
  };
}

export function sanitizeViewFilters(raw: unknown): ViewFilters {
  if (!isPlainObject(raw)) return {};
  const out: ViewFilters = {};
  const typeIds = sanitizeStringArray(raw.typeIds, 50, 64);
  if (typeIds && typeIds.length > 0) out.typeIds = typeIds;

  if (Array.isArray(raw.priorities)) {
    const priorities = raw.priorities.filter(
      (p): p is Priority =>
        typeof p === "string" && VALID_PRIORITIES.has(p as Priority)
    );
    if (priorities.length > 0) out.priorities = priorities;
  }

  const labels = sanitizeStringArray(raw.labels, LIMITS.MAX_LABELS, LIMITS.LABEL);
  if (labels && labels.length > 0) out.labels = labels;

  return out;
}

export function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("unique") || msg.includes("constraint");
}

/**
 * Validates that typeId, statusId, and parentId belong to the given project,
 * prevents circular parent chains, and enforces hierarchy tiers when enabled.
 */
export async function validateItemReferences(opts: {
  projectId: string;
  itemId?: string;
  typeId?: string;
  effectiveTypeId: string;
  statusId?: string;
  parentId?: string | null;
  enforceHierarchy: boolean;
}): Promise<string | null> {
  const {
    projectId,
    itemId,
    typeId,
    effectiveTypeId,
    statusId,
    parentId,
    enforceHierarchy,
  } = opts;

  if (typeId !== undefined) {
    const [typeRow] = await db
      .select({ id: itemTypes.id })
      .from(itemTypes)
      .where(and(eq(itemTypes.id, typeId), eq(itemTypes.projectId, projectId)));
    if (!typeRow) {
      return "Invalid item type for this project";
    }
  }

  if (statusId !== undefined) {
    const [statusRow] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));
    if (!statusRow) {
      return "Invalid status for this project";
    }
  }

  if (parentId !== undefined && parentId !== null) {
    if (itemId && parentId === itemId) {
      return "An item cannot be its own parent";
    }

    const [parentRow] = await db
      .select({ id: items.id, typeId: items.typeId, parentId: items.parentId })
      .from(items)
      .where(and(eq(items.id, parentId), eq(items.projectId, projectId)));

    if (!parentRow) {
      return "Invalid parent item for this project";
    }

    // Prevent circular ancestry chains
    if (itemId) {
      const projectItems = await db
        .select({ id: items.id, parentId: items.parentId })
        .from(items)
        .where(eq(items.projectId, projectId));
      const parentById = new Map(projectItems.map((i) => [i.id, i.parentId]));

      let cursor: string | null | undefined = parentRow.parentId;
      const seen = new Set<string>([parentId]);
      while (cursor) {
        if (cursor === itemId) {
          return "Circular parent relationship is not allowed";
        }
        if (seen.has(cursor)) break;
        seen.add(cursor);
        cursor = parentById.get(cursor);
      }
    }

    if (enforceHierarchy) {
      const [childType] = await db
        .select({ level: itemTypes.level })
        .from(itemTypes)
        .where(
          and(
            eq(itemTypes.id, effectiveTypeId),
            eq(itemTypes.projectId, projectId)
          )
        );
      const [parentType] = await db
        .select({ level: itemTypes.level })
        .from(itemTypes)
        .where(
          and(
            eq(itemTypes.id, parentRow.typeId),
            eq(itemTypes.projectId, projectId)
          )
        );
      if (childType && parentType && parentType.level >= childType.level) {
        return "Parent item must be at a higher hierarchy level";
      }
    }
  }

  return null;
}
