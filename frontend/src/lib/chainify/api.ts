import { chainifyConfig } from "./config";
import type {
  ChainifyErrorCode,
  DiscoveryResponse,
  HealthResponse,
  IdentityResolveResponse,
  ListingDocumentResponse,
  MetaResponse,
  PodProbeResponse,
  ReadyResponse,
  VerificationResponse,
} from "./types";

const REQUEST_TIMEOUT_MS = 8_000;
const KNOWN_CODES: ReadonlySet<string> = new Set([
  "missing_webid",
  "ssrf_blocked",
  "webid_not_found",
  "webid_forbidden",
  "webid_requires_auth",
  "pod_unreachable",
  "rate_limited",
  "parse_failed",
  "profile_too_large",
  "no_storage_declared",
  "missing_participants",
  "missing_url",
  "discovery_unavailable",
  "verification_unavailable",
  "bad_request",
]);

interface ErrorEnvelope {
  error?: unknown;
  message?: unknown;
  detail?: unknown;
}

export class ChainifyApiError extends Error {
  readonly code: ChainifyErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(
    code: ChainifyErrorCode,
    message: string,
    status: number,
    detail?: string,
  ) {
    super(message);
    this.name = "ChainifyApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function parseErrorCode(value: unknown): ChainifyErrorCode {
  if (typeof value === "string" && KNOWN_CODES.has(value)) {
    return value as ChainifyErrorCode;
  }
  return "unknown";
}

/** Builds a timeout signal, optionally linked to a caller-provided signal. */
function timeoutSignal(parent?: AbortSignal): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

/**
 * Credential-free JSON fetch against the Chainify node.
 * Response bodies are never logged; only typed data is returned to callers.
 *
 * In the browser the call goes to this origin's `/api` rewrites (see
 * next.config.ts), so an https page never issues a mixed-content request to the
 * plain-http API and no CORS preflight is needed. Server-side rendering keeps the
 * absolute base URL, where there is no origin to be relative to.
 */
async function request<T>(
  path: string,
  signal?: AbortSignal,
  init?: { method: "POST"; body: unknown },
): Promise<T> {
  const { signal: linked, cancel } = timeoutSignal(signal);
  const base = typeof window === "undefined" ? chainifyConfig.apiBaseUrl : "";
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: init?.method ?? "GET",
      headers: init
        ? { Accept: "application/json", "Content-Type": "application/json" }
        : { Accept: "application/json" },
      body: init ? JSON.stringify(init.body) : undefined,
      credentials: "omit",
      cache: "no-store",
      signal: linked,
    });
  } catch (error) {
    if (linked.aborted) {
      throw new ChainifyApiError(
        "timeout",
        "The Chainify node did not respond within 8 seconds.",
        0,
      );
    }
    throw new ChainifyApiError(
      "network_error",
      error instanceof Error ? error.message : "Network request failed.",
      0,
    );
  } finally {
    cancel();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ChainifyApiError(
      "invalid_response",
      "The Chainify node returned a response that is not valid JSON.",
      response.status,
    );
  }

  if (!response.ok) {
    const envelope = (payload ?? {}) as ErrorEnvelope;
    const message =
      typeof envelope.message === "string"
        ? envelope.message
        : `The request failed with status ${response.status}.`;
    const detail =
      typeof envelope.detail === "string" ? envelope.detail : undefined;
    throw new ChainifyApiError(
      parseErrorCode(envelope.error),
      message,
      response.status,
      detail,
    );
  }

  return payload as T;
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>("/healthz", signal);
}

export function getReady(signal?: AbortSignal): Promise<ReadyResponse> {
  return request<ReadyResponse>("/readyz", signal);
}

export function getMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return request<MetaResponse>("/api/meta", signal);
}

export function resolveIdentity(
  webId: string,
  signal?: AbortSignal,
): Promise<IdentityResolveResponse> {
  const query = new URLSearchParams({ webid: webId });
  return request<IdentityResolveResponse>(
    `/api/identity/resolve?${query.toString()}`,
    signal,
  );
}

export function probePod(
  storage: string,
  signal?: AbortSignal,
): Promise<PodProbeResponse> {
  const query = new URLSearchParams({ storage });
  return request<PodProbeResponse>(
    `/api/pod/probe?${query.toString()}`,
    signal,
  );
}

/**
 * Asks the node to read a set of peer indexes and merge them.
 *
 * The participant list is a body rather than a query string: twenty-four absolute URLs
 * do not belong in a URL. Nothing about the result is stored — every response is the
 * node's answer at that moment.
 */
export function queryDiscovery(
  participants: readonly string[],
  query: string,
  signal?: AbortSignal,
): Promise<DiscoveryResponse> {
  return request<DiscoveryResponse>("/api/discovery/query", signal, {
    method: "POST",
    body: { participants, query },
  });
}

export function verifyDocument(
  url: string,
  signal?: AbortSignal,
): Promise<VerificationResponse> {
  const params = new URLSearchParams({ url });
  return request<VerificationResponse>(
    `/api/listing/verify?${params.toString()}`,
    signal,
  );
}

export function fetchListingDocument(
  url: string,
  signal?: AbortSignal,
): Promise<ListingDocumentResponse> {
  const params = new URLSearchParams({ url });
  return request<ListingDocumentResponse>(
    `/api/listing/document?${params.toString()}`,
    signal,
  );
}
