"use client";

import React from "react";
import {
  Layers,
  Rocket,
  CheckSquare,
  Sparkles,
  Bug,
  Flag,
  Lightbulb,
  FlaskConical,
  Target,
  Bookmark,
  Zap,
  Shield,
  Wrench,
  FileText,
  FolderKanban,
  Star,
  Cpu,
  Compass,
  Flame,
  AlertOctagon,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Minus,
  type LucideProps,
} from "lucide-react";
import type { Priority } from "@/types";

export const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Layers,
  Rocket,
  CheckSquare,
  Sparkles,
  Bug,
  Flag,
  Lightbulb,
  FlaskConical,
  Target,
  Bookmark,
  Zap,
  Shield,
  Wrench,
  FileText,
  FolderKanban,
  Star,
  Cpu,
  Compass,
  Flame,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export const COLOR_PALETTE = [
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#64748b", // slate
];

export function DynamicIcon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = ICON_MAP[name] ?? CheckSquare;
  return <Icon className={className} style={style} />;
}

export const PRIORITY_META: Record<
  Priority,
  {
    label: string;
    color: string;
    bgClass: string;
    textClass: string;
    order: number;
  }
> = {
  urgent: {
    label: "Urgent",
    color: "#ef4444",
    bgClass: "bg-red-500/12 border-red-500/25",
    textClass: "text-red-600 dark:text-red-400",
    order: 0,
  },
  high: {
    label: "High",
    color: "#f97316",
    bgClass: "bg-orange-500/12 border-orange-500/25",
    textClass: "text-orange-600 dark:text-orange-400",
    order: 1,
  },
  medium: {
    label: "Medium",
    color: "#f59e0b",
    bgClass: "bg-amber-500/12 border-amber-500/25",
    textClass: "text-amber-600 dark:text-amber-400",
    order: 2,
  },
  low: {
    label: "Low",
    color: "#3b82f6",
    bgClass: "bg-blue-500/12 border-blue-500/25",
    textClass: "text-blue-600 dark:text-blue-400",
    order: 3,
  },
  none: {
    label: "None",
    color: "#94a3b8",
    bgClass: "bg-slate-500/10 border-slate-500/20",
    textClass: "text-slate-500 dark:text-slate-400",
    order: 4,
  },
};

export const PRIORITY_LIST: Priority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

export function PriorityIcon({
  priority,
  className = "h-3.5 w-3.5",
}: {
  priority: Priority;
  className?: string;
}) {
  switch (priority) {
    case "urgent":
      return <AlertOctagon className={className} style={{ color: "#ef4444" }} />;
    case "high":
      return <ArrowUp className={className} style={{ color: "#f97316" }} />;
    case "medium":
      return <ArrowRight className={className} style={{ color: "#f59e0b" }} />;
    case "low":
      return <ArrowDown className={className} style={{ color: "#3b82f6" }} />;
    default:
      return <Minus className={className} style={{ color: "#94a3b8" }} />;
  }
}
