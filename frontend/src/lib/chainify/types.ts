export type ChainifyErrorCode =
  | "missing_webid"
  | "ssrf_blocked"
  | "webid_not_found"
  | "webid_forbidden"
  | "webid_requires_auth"
  | "pod_unreachable"
  | "rate_limited"
  | "parse_failed"
  | "profile_too_large"
  | "no_storage_declared"
  | "missing_participants"
  | "missing_url"
  | "discovery_unavailable"
  | "verification_unavailable"
  | "bad_request"
  | "network_error"
  | "timeout"
  | "invalid_response"
  | "unknown";

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  commit: string;
  uptimeSeconds: number;
  time: string;
}

export interface ProviderReadiness {
  issuer: string;
  reachable: boolean;
  statusCode?: number;
  reason?: string;
}

export interface ReadyResponse {
  status: string;
  provider: ProviderReadiness;
  time: string;
}

export interface MetaResponse {
  service: string;
  phase: number;
  issuer: string;
  allowedOrigins: string[];
  fetchAllowlist: string[];
  fetchTimeoutMs: number;
  maxProfileBytes: number;
  /** Upper bound on how many peer indexes one discovery query will read. */
  maxParticipants: number;
  authoritativeStore: string;
  notes: string[];
}

export interface IdentityResolveResponse {
  webId: string;
  storage: string[];
  issuer?: string;
  resolvedAt: string;
  sourceContentType?: string;
}

export interface PodProbeResponse {
  url: string;
  reachable: boolean;
  statusCode?: number;
  latencyMs?: number;
  contentType?: string;
  reason?: string;
  checkedAt: string;
}

/** Snapshot of the Solid session, safe to hold in React state. */
export interface SolidSessionState {
  status: "loading" | "authenticated" | "anonymous";
  isLoggedIn: boolean;
  webId?: string;
  sessionId?: string;
}

/** View model for the Pod connectivity card. */
export interface PodStatusViewModel {
  webId: string;
  storage: string[];
  issuer?: string;
  resolvedAt: string;
}

/* ---------------------------------------------------------------------------
   Discovery and verification
   ------------------------------------------------------------------------ */

/** One business row read from a peer's public index. */
export interface DiscoveryEntry {
  /** Resource URL of the full document, when the peer published one. */
  url: string;
  title: string;
  category: string;
  location: string;
  kind: string;
  quantity?: string;
  unit?: string;
  /** The index this row came from: the only reliable provenance the node has. */
  participant: string;
}

/** One peer index the node tried to read, including the ones that refused. */
export interface DiscoveryPeer {
  url: string;
  reachable: boolean;
  webId?: string;
  displayName?: string;
  publishedAt?: string;
  entries: number;
  statusCode?: number;
  error?: string;
  errorCode?: string;
  fetchedAt?: string;
}

export interface DiscoveryResponse {
  query: string;
  peers: DiscoveryPeer[];
  entries: DiscoveryEntry[];
  /** Plain sentences stating what a merged result does and does not mean. */
  notes: string[];
  fetchedAt: string;
}

export type VerificationResult = "pass" | "warn" | "fail" | "unknown";

export interface VerificationCheck {
  id: string;
  label: string;
  result: VerificationResult;
  detail: string;
}

export interface VerificationResponse {
  url: string;
  webId?: string;
  name?: string;
  kind?: string;
  checks: VerificationCheck[];
  /** Weakest check result, so the UI can never show a stronger claim than the checks. */
  verdict: VerificationResult;
  limits: string[];
  fetchedAt: string;
}

/** Reduced view of a single document, used for peer previews. */
export interface ListingDocumentResponse {
  url: string;
  webId?: string;
  name?: string;
  description?: string;
  category?: string;
  location?: string;
  quantity?: string;
  unit?: string;
  kind?: string;
  fetchedAt: string;
}
