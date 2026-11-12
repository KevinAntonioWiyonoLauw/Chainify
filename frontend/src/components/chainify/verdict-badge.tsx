"use client";

import { ShieldCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VerificationResult } from "@/lib/chainify/types";

/**
 * One badge for a structural verdict.
 *
 * The wording is deliberate: a `warn` verdict is the best a prototype document can reach
 * here, so the label says what the checks did ("struktur terbaca") instead of implying the
 * business claim was confirmed. A "verified" label would be a lie the backend refuses to
 * make, and the UI must not make it either.
 */
const VERDICT: Record<
  VerificationResult,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pass: { label: "Struktur lengkap", variant: "default" },
  warn: { label: "Perlu ditinjau", variant: "secondary" },
  fail: { label: "Tidak lolos", variant: "destructive" },
  unknown: { label: "Belum dinilai", variant: "outline" },
};

const ICON = {
  pass: ShieldCheck,
  warn: TriangleAlert,
  fail: TriangleAlert,
  unknown: ShieldQuestion,
} as const;

export function VerdictBadge({ verdict }: { verdict: VerificationResult }) {
  const config = VERDICT[verdict];
  const Icon = ICON[verdict];
  return (
    <Badge variant={config.variant} className="gap-1.5 font-normal">
      <Icon aria-hidden />
      {config.label}
    </Badge>
  );
}
