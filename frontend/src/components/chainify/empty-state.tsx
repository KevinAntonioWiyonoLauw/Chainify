"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

/** The one empty state every list uses, so an empty container always explains itself. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-surface border border-dashed border-border-strong p-6">
      <span className="icon-plate" aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col gap-1">
        <h3>{title}</h3>
        <div className="text-body text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}
