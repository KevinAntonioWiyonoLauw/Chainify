"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ActiveSessions } from "@/components/block/active-sessions";
import type { ActiveSession } from "@/components/block/active-sessions";
import { StatusBars, fillStatusDays, toIsoDate, useStatusToday } from "@/components/block/status-bars";
import type { StatusDay } from "@/components/block/status-bars";
import { PodStatusCard } from "@/components/chainify/pod-status-card";
import { PodSummaryCard } from "@/components/chainify/pod-summary-card";
import { ProtectedNotice } from "@/components/chainify/protected-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getReady } from "@/lib/chainify/api";
import type { RepositoryContext } from "@/lib/chainify/repository";
import type { ReadyResponse } from "@/lib/chainify/types";
import { useOwner } from "@/lib/chainify/use-owner";
import { useSolidSession } from "@/lib/solid/use-solid-session";

const WINDOW_DAYS = 7;

export default function DashboardPage() {
  const session = useSolidSession();
  const owner = useOwner(session);
  // useStatusToday is null on the server and resolves on the client, which
  // keeps the prerender deterministic under cacheComponents.
  const today = useStatusToday();
  const [readiness, setReadiness] = useState<ReadyResponse | null>(null);
  const [readyChecked, setReadyChecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getReady(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setReadiness(result);
      })
      .catch(() => {
        // An unreachable node simply leaves the window undetermined.
      })
      .finally(() => {
        if (!controller.signal.aborted) setReadyChecked(true);
      });
    return () => controller.abort();
  }, []);

  const days = useMemo<StatusDay[]>(() => {
    if (!today) return [];
    const from = toIsoDate(Date.parse(`${today}T00:00:00Z`) - (WINDOW_DAYS - 1) * 86_400_000);
    // Phase 1 collects no historical uptime. Only today carries a real
    // observation from /readyz; earlier days are explicitly "no data".
    const entries: StatusDay[] = [];
    if (readiness) {
      entries.push({
        date: today,
        status: readiness.provider.reachable ? "up" : "down",
        incidents: readiness.provider.reachable
          ? undefined
          : [
              {
                title: readiness.provider.reason ?? "Provider unreachable",
                status: "down",
              },
            ],
      });
    }
    return fillStatusDays(from, today, entries).map((day) =>
      entries.some((entry) => entry.date === day.date)
        ? day
        : { date: day.date, status: "none" as const },
    );
  }, [today, readiness]);

  // The Pod provider owns session revocation. This list is local to the
  // current browser session only; it is not a provider-wide device list.
  const sessions = useMemo<ActiveSession[]>(() => {
    if (!session.isLoggedIn || !session.sessionId) return [];
    return [
      {
        id: session.sessionId,
        device: "laptop",
        name: "This browser — Solid-OIDC session",
        lastActiveAt: readiness?.time ?? (today ? `${today}T00:00:00Z` : ""),
        current: true,
      },
    ];
  }, [session, readiness, today]);

  const providerState = readiness
    ? readiness.provider.reachable
      ? "Reachable"
      : "Unreachable"
    : readyChecked
      ? "Node offline"
      : "Checking";

  // The summary card reads the Pod through the same owner resolution every other page
  // uses, so it appears at the same moment the session becomes usable.
  const podContext = useMemo<RepositoryContext | null>(
    () =>
      owner.status === "ready"
        ? { storage: owner.storage, webId: owner.webId }
        : null,
    [owner],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div className="max-w-2xl">
          <h1>Workspace overview</h1>
          <p className="page-lead mt-1.5">
            Live Solid identity, Pod resolution, and provider readiness. No
            business data is cached into a central database.
          </p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/pod" />}>
          Open Pod access
          <ArrowUpRight aria-hidden />
        </Button>
      </div>

      {session.status === "loading" && (
        <div className="grid-dashboard" aria-label="Loading workspace">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {session.status === "anonymous" && (
        <ProtectedNotice
          reason={session.webId ? "session-missing" : "session-required"}
        />
      )}

      {session.status === "authenticated" && session.webId && (
        <>
          <div className="grid-dashboard">
            {podContext ? (
              <PodSummaryCard ctx={podContext} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Isi Pod Anda</CardTitle>
                  <CardDescription>
                    Menunggu storage Pod ditemukan dari WebID Anda…
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-24 w-full rounded-control" />
                </CardContent>
              </Card>
            )}

            <PodStatusCard webId={session.webId} />
          </div>

          <div className="grid-dashboard">
            <Card>
              <CardHeader>
                <CardTitle>Kesiapan penyedia Pod</CardTitle>
                <CardDescription className="break-words">
                  {readiness
                    ? `${readiness.provider.issuer} — probe terakhir.`
                    : readyChecked
                      ? "Node Chainify tidak dapat dihubungi untuk pemeriksaan kesiapan."
                      : "Memeriksa kesiapan penyedia…"}
                </CardDescription>
                <CardAction>
                  <Badge variant="secondary" className="gap-1.5 font-normal">
                    <span
                      aria-hidden
                      className={
                        readiness?.provider.reachable
                          ? "status-dot status-dot-ok"
                          : "status-dot"
                      }
                    />
                    {providerState}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                {today ? (
                  <StatusBars
                    days={days}
                    label="Solid identity provider"
                    maxDays={WINDOW_DAYS}
                    loading={!readyChecked}
                  />
                ) : (
                  <Skeleton className="h-16 w-full" />
                )}
                <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                  Hanya hari ini yang mencerminkan probe nyata. Hari sebelumnya
                  ditandai tanpa data; Chainify tidak mengarang uptime historis.
                </p>
              </CardContent>
            </Card>
          </div>

          <ActiveSessions
            sessions={sessions}
            heading="Current Solid session"
            headingLevel={2}
            description="Your browser's DPoP-bound session. Revocation is owned by the Pod provider; this list reflects only this browser."
          />
        </>
      )}
    </div>
  );
}
