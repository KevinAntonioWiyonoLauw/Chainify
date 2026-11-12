"use client";

import { useEffect, useState } from "react";
import { Database, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { ChainifyApiError, resolveIdentity } from "@/lib/chainify/api";
import type {
  ChainifyErrorCode,
  PodStatusViewModel,
} from "@/lib/chainify/types";

const ERROR_MESSAGES: Record<ChainifyErrorCode, string> = {
  missing_webid: "No WebID was provided. Sign in again to resolve your Pod.",
  ssrf_blocked:
    "The resolver refused this address because it points to a restricted network location.",
  webid_not_found: "No profile document was found at this WebID.",
  webid_forbidden: "The profile document denied access to the resolver.",
  webid_requires_auth:
    "This WebID profile is private. The public resolver cannot read it.",
  pod_unreachable:
    "The Pod could not be reached. It may be offline or temporarily unavailable.",
  rate_limited:
    "Too many resolution requests. Wait a moment and try again.",
  parse_failed:
    "The WebID profile could not be parsed as a valid RDF document.",
  profile_too_large:
    "The WebID profile exceeds the resolver's size limit.",
  no_storage_declared:
    "The profile is valid, but it declares no Solid storage (pim:storage).",
  missing_participants: "Discovery needs at least one participant index URL.",
  missing_url: "Enter a document URL first.",
  discovery_unavailable:
    "This node has discovery disabled, so peer indexes cannot be read here.",
  verification_unavailable:
    "This node has verification disabled, so documents cannot be checked here.",
  bad_request: "The node rejected the request shape.",
  network_error:
    "The Chainify node could not be reached. Check that the backend is running.",
  timeout: "The resolution request timed out. Try again shortly.",
  invalid_response: "The Chainify node returned an unreadable response.",
  unknown: "The Pod could not be resolved. Try again shortly.",
};

interface PodStatusCardProps {
  webId: string;
}

export function PodStatusCard({ webId }: PodStatusCardProps) {
  const [pod, setPod] = useState<PodStatusViewModel | null>(null);
  const [error, setError] = useState<ChainifyApiError | null>(null);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const status =
    resolvedFor !== webId ? "loading" : error ? "error" : pod ? "ready" : "loading";

  useEffect(() => {
    const controller = new AbortController();
    resolveIdentity(webId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setPod({
          webId: result.webId,
          storage: result.storage,
          issuer: result.issuer,
          resolvedAt: result.resolvedAt,
        });
        setError(null);
        setResolvedFor(webId);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setPod(null);
        setError(
          cause instanceof ChainifyApiError
            ? cause
            : new ChainifyApiError("unknown", "Resolution failed.", 0),
        );
        setResolvedFor(webId);
      });
    return () => controller.abort();
  }, [webId]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          Pod resolution
        </CardTitle>
        <CardDescription>
          Resolved live by the stateless Chainify node. No profile data is
          stored centrally.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <span aria-hidden className={status === "ready" ? "status-dot status-dot-ok" : "status-dot"} />
            {status === "ready" ? "Resolved" : status === "error" ? "Unavailable" : "Resolving"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div aria-live="polite">
          {status === "loading" && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {status === "error" && error && (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>Could not resolve Pod</AlertTitle>
              <AlertDescription>{ERROR_MESSAGES[error.code]}</AlertDescription>
            </Alert>
          )}
          {status === "ready" && pod && (
            <dl className="text-body">
              <div className="metric-row">
                <dt className="metric-label">WebID</dt>
                <dd className="metric-value">{pod.webId}</dd>
              </div>
              <div className="metric-row">
                <dt className="metric-label">Storage ({pod.storage.length})</dt>
                <dd className="metric-value flex flex-col gap-1">
                  {pod.storage.map((url) => <span key={url}>{url}</span>)}
                </dd>
              </div>
              {pod.issuer && (
                <div className="metric-row">
                  <dt className="metric-label">OIDC issuer</dt>
                  <dd className="metric-value">{pod.issuer}</dd>
                </div>
              )}
              <div className="metric-row">
                <dt className="metric-label">Resolved at</dt>
                <dd className="metric-value metric-value-muted">
                  <time dateTime={pod.resolvedAt}>{pod.resolvedAt}</time>
                </dd>
              </div>
            </dl>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
