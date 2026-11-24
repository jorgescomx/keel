import type { ItemType, WorkItem } from "@/types";

export const HIERARCHY_LEVELS = [
  { level: 1, label: "Level 1 (Top)", hint: "e.g. Initiative, Goal, Epic" },
  { level: 2, label: "Level 2", hint: "e.g. Feature, Story" },
  { level: 3, label: "Level 3", hint: "e.g. Task, Defect" },
  { level: 4, label: "Level 4", hint: "e.g. Sub-task" },
  { level: 5, label: "Level 5 (Leaf)", hint: "e.g. Checklist item" },
];

/**
 * Returns all descendant item IDs of `rootId` (to prevent circular parent cycles).
 */
export function getDescendantIds(rootId: string, allItems: WorkItem[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const item of allItems) {
    if (item.parentId) {
      const list = childrenByParent.get(item.parentId) ?? [];
      list.push(item.id);
      childrenByParent.set(item.parentId, list);
    }
  }

  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    const kids = childrenByParent.get(curr) ?? [];
    for (const k of kids) {
      if (!visited.has(k)) {
        visited.add(k);
        stack.push(k);
      }
    }
  }
  return visited;
}

/**
 * Filters candidate parent items for a given item (or new item with typeId).
 * Always prevents circular references; when `enforceHierarchy` is true,
 * only items with a strictly higher tier (smaller level number) are returned.
 */
export function getValidParentCandidates(
  currentItemId: string | null,
  currentTypeId: string,
  allItems: WorkItem[],
  itemTypes: ItemType[],
  enforceHierarchy: boolean
): WorkItem[] {
  const typeMap = new Map(itemTypes.map((t) => [t.id, t]));
  const currentLevel = typeMap.get(currentTypeId)?.level ?? 2;
  const blocked = currentItemId
    ? getDescendantIds(currentItemId, allItems)
    : new Set<string>();
  if (currentItemId) blocked.add(currentItemId);

  return allItems.filter((candidate) => {
    if (blocked.has(candidate.id)) return false;
    if (!enforceHierarchy) return true;
    const candLevel = typeMap.get(candidate.typeId)?.level ?? 2;
    return candLevel < currentLevel;
  });
}

/**
 * Picks the best default ItemType when adding a child/sub-item under `parentTypeId`.
 * Looks for the closest lower level (higher level number), falling back to Task or first type.
 */
export function getDefaultChildTypeId(
  parentTypeId: string,
  itemTypes: ItemType[]
): string | undefined {
  if (itemTypes.length === 0) return undefined;
  const parentType = itemTypes.find((t) => t.id === parentTypeId);
  if (parentType) {
    const lower = itemTypes
      .filter((t) => t.level > parentType.level)
      .sort((a, b) => a.level - b.level || a.position - b.position);
    if (lower.length > 0) return lower[0].id;
  }
  return (
    itemTypes.find((t) => t.name.toLowerCase() === "task")?.id ??
    itemTypes[0].id
  );
}
