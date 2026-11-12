/**
 * Solid Pod I/O for Chainify business resources.
 *
 * Two rules shape this module, and the Go API is deliberately not involved:
 *
 *  1. Every read and write uses the session's authenticated fetch, so DPoP and the
 *     access decision stay with the Pod. Nothing here holds or forwards a token.
 *  2. Nothing is cached between calls. A read returns what the Pod answered at that
 *     moment; there is no service-side copy of a business document.
 */

import {
  createAclFromFallbackAcl,
  createContainerAt,
  getAgentDefaultAccessAll,
  getFile,
  getPublicDefaultAccess,
  getPublicResourceAccess,
  getResourceAcl,
  getResourceInfoWithAcl,
  hasAccessibleAcl,
  hasFallbackAcl,
  saveAclFor,
  setAgentDefaultAccess,
  setAgentResourceAccess,
  setPublicDefaultAccess,
  setPublicResourceAccess,
} from "@inrupt/solid-client";
import { getSession } from "@/lib/solid/session";

/** The agent class that any authenticated WebID belongs to. */
const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";

/**
 * Upper bound on a single resource read. Chainify documents are small by design; a
 * larger body is a sign of the wrong resource, not of a bigger listing.
 */
const MAX_DOCUMENT_BYTES = 512 * 1024;

export type PodAccessStatus =
  | "ok"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "offline"
  | "error"
  /**
   * The request never had a destination: the owner's storage root has not resolved.
   * Distinct from `offline` because retrying the same URL cannot help — the session
   * has to be re-established first.
   */
  | "no_storage";

export class PodError extends Error {
  readonly status: number;
  readonly kind: PodAccessStatus;

  constructor(kind: PodAccessStatus, message: string, status: number) {
    super(message);
    this.name = "PodError";
    this.kind = kind;
    this.status = status;
  }
}

function classify(status: number): PodAccessStatus {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status >= 500) return "offline";
  return status === 0 ? "offline" : "error";
}

/** UI copy for each Pod failure, kept next to the mapping so they cannot drift. */
export const POD_ERROR_MESSAGES: Record<PodAccessStatus, string> = {
  ok: "",
  unauthorized:
    "Sesi Solid Anda tidak lagi berlaku untuk resource ini. Masuk ulang lalu coba lagi.",
  forbidden:
    "Pod menolak akses ke resource ini. Chainify tidak mencari jalan lain: keputusan akses milik pemilik Pod.",
  not_found: "Resource belum ada di Pod.",
  offline:
    "Pod tidak dapat dihubungi. Periksa koneksi atau status provider, lalu coba lagi.",
  error: "Pod mengembalikan respons yang tidak dapat diproses.",
  no_storage:
    "Alamat Pod Anda belum terbaca. Muat ulang halaman; kalau tetap begini, masuk ulang dengan Solid-OIDC.",
};

function networkError(cause: unknown): PodError {
  const detail = cause instanceof Error ? cause.message : "network error";
  // A TypeError from `fetch` about the URL means the address was malformed, not that
  // the provider is down. Reporting "offline" there sends the owner to check a
  // connection that is fine.
  if (cause instanceof TypeError && /URL/i.test(detail)) {
    return new PodError("no_storage", POD_ERROR_MESSAGES.no_storage, 0);
  }
  return new PodError(
    "offline",
    `${POD_ERROR_MESSAGES.offline} (${detail})`,
    0,
  );
}

async function toPodError(response: Response, context: string): Promise<PodError> {
  const detail = await response.text().catch(() => "");
  const suffix = detail ? ` ${detail.slice(0, 160)}` : "";
  const kind = classify(response.status);
  return new PodError(
    kind,
    `${context} (HTTP ${response.status}).${suffix || ` ${POD_ERROR_MESSAGES[kind]}`}`,
    response.status,
  );
}

/**
 * Rejects a URL that could not have come from a resolved Pod before `fetch` sees it.
 *
 * `fetch("")` throws `TypeError: Failed to construct 'URL': Invalid URL`, which says
 * nothing about the real problem and gets flattened into "the Pod cannot be reached".
 * An empty or relative URL can only mean the storage root never resolved, so it is
 * reported as what it is: a missing storage location, not a network fault.
 *
 * The check is deliberately not an SSRF guard. That policy lives in the node and must
 * not be duplicated here, where every legitimate request targets the owner's own Pod.
 */
function assertPodUrl(url: string, what: string): void {
  const usable =
    typeof url === "string" &&
    url.length > 0 &&
    (url.startsWith("https://") || url.startsWith("http://"));
  if (usable) return;
  throw new PodError(
    "no_storage",
    `${what} tidak punya alamat Pod yang sah. Muat ulang halaman setelah sesi Solid tersambung.`,
    0,
  );
}

function acceptsJsonLd(): HeadersInit {
  return {
    Accept:
      "application/ld+json, application/json;q=0.9, text/turtle;q=0.8, */*;q=0.5",
  };
}

/** Fetches a JSON-LD document as text; a 404 is a normal, expected answer. */
export async function readDocument(url: string): Promise<string | null> {
  assertPodUrl(url, "Dokumen Pod");
  let response: Response;
  try {
    response = await getSession().fetch(url, {
      headers: acceptsJsonLd(),
      cache: "no-store",
    });
  } catch (cause) {
    throw networkError(cause);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw await toPodError(response, "Gagal membaca resource Pod");

  const text = await response.text();
  if (text.length > MAX_DOCUMENT_BYTES) {
    throw new PodError(
      "error",
      `Resource melebihi batas ${Math.floor(MAX_DOCUMENT_BYTES / 1024)} KiB yang dibaca Chainify.`,
      413,
    );
  }
  return text;
}

/**
 * Writes (replaces) a resource with a JSON-LD body.
 *
 * Solid servers create missing parent containers on PUT for most providers, but not
 * all, so callers that may write into a fresh Pod call `ensureContainer` first.
 */
export async function writeDocument(url: string, body: string): Promise<void> {
  assertPodUrl(url, "Dokumen Pod");
  let response: Response;
  try {
    response = await getSession().fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/ld+json", ...acceptsJsonLd() },
      body,
    });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!response.ok) {
    throw await toPodError(response, "Gagal menulis resource ke Pod");
  }
  // Drain so the connection returns to the pool instead of stalling on keep-alive.
  await response.body?.cancel().catch(() => undefined);
}

/** Deletes a resource. An already-missing resource counts as deleted. */
export async function deleteDocument(url: string): Promise<void> {
  assertPodUrl(url, "Dokumen Pod");
  let response: Response;
  try {
    response = await getSession().fetch(url, { method: "DELETE" });
  } catch (cause) {
    throw networkError(cause);
  }
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) throw await toPodError(response, "Gagal menghapus resource Pod");
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Creates a container when it does not exist yet; existing ones are left untouched.
 *
 * Two answers mean "already there" and both must be tolerated, because an owner who
 * cannot write to a container they own is a false failure that hides the real work:
 *
 *  - `409 Conflict` — the provider refuses to recreate an existing container;
 *  - `403 Forbidden` — `createContainerAt` relies on a PUT with
 *    `If-None-Match: *`, and a provider that does not honour that precondition answers
 *    403 instead of 412. The container exists and is readable, which is all the caller
 *    needs, so the check is a plain GET before the throw.
 */
export async function ensureContainer(containerUrl: string): Promise<void> {
  assertPodUrl(containerUrl, "Container Pod");
  try {
    await createContainerAt(containerUrl, { fetch: getSession().fetch });
  } catch (cause) {
    const status = readStatus(cause);
    if (status === 409 || status === 412) return;
    if (status === 403 && (await containerExists(containerUrl))) return;
    throw new PodError(
      classify(status),
      `${POD_ERROR_MESSAGES[classify(status)]} (container ${status || "network"})`,
      status,
    );
  }
}

/** True when the container answers any success, including an empty listing. */
async function containerExists(containerUrl: string): Promise<boolean> {
  try {
    const response = await getSession().fetch(containerUrl, {
      headers: { Accept: "text/turtle, application/ld+json;q=0.9, */*;q=0.5" },
      cache: "no-store",
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Lists the child resource URLs of a container, or [] when the container is missing.
 *
 * A brand-new Pod has no Chainify container: that is the normal first-run state, not
 * an error. Only URLs that live directly under the container are returned, so nested
 * documents are not mistaken for siblings.
 */
export async function listContainer(containerUrl: string): Promise<string[]> {
  assertPodUrl(containerUrl, "Container Pod");
  let response: Response;
  try {
    response = await getSession().fetch(containerUrl, {
      headers: { Accept: "text/turtle, application/ld+json;q=0.9, */*;q=0.5" },
      cache: "no-store",
    });
  } catch (cause) {
    throw networkError(cause);
  }
  if (response.status === 404) return [];
  if (!response.ok) throw await toPodError(response, "Gagal membaca container Pod");

  const text = await response.text();
  return extractChildUrls(text, containerUrl);
}

/**
 * Pulls contained resource URLs out of an RDF container listing.
 *
 * Two shapes have to be accepted, because both are valid Solid and both are seen in
 * the wild:
 *
 *  - absolute IRIs originating at the container (`ldp:contains <https://…/a.jsonld>`);
 *  - paths relative to the container (`ldp:contains <a.jsonld>`), which is what
 *    Community Solid Server emits.
 *
 * Only direct children are kept: no further slash before an optional fragment, so a
 * nested document is never mistaken for a sibling.
 */
function extractChildUrls(body: string, containerUrl: string): string[] {
  const found = new Set<string>();

  const accept = (candidate: string) => {
    if (!candidate.startsWith(containerUrl)) return;
    const rest = candidate.slice(containerUrl.length);
    if (rest === "") return;
    if (rest.split("#")[0].includes("/")) return;
    found.add(candidate);
  };

  for (const match of body.matchAll(/https?:\/\/[^\s<>"'`,;)\]]+/g)) {
    accept(match[0].replace(/[.\s]+$/, ""));
  }

  // Relative members of the listing itself. A bare `<name>` is only ever a member
  // here, so a segment without a slash or a colon is taken at face value.
  for (const match of body.matchAll(/<(?!https?:|\/\/)([^<>:\s?#/][^<>:\s?#]*[^<>:\s.])>/g)) {
    accept(`${containerUrl}${match[1]}`);
  }

  return [...found].sort();
}

/**
 * Test seam for the container listing reader.
 *
 * `extractChildUrls` is private because it is only meaningful against a real listing
 * body, but a regression here empties every page in the app without an error, so it is
 * exported under an explicit test-only name rather than left untested.
 */
export const extractChildUrlsForTest = extractChildUrls;

/** Best-effort status extraction from an Inrupt client error. */
function readStatus(cause: unknown): number {
  if (typeof cause !== "object" || cause === null) return 0;
  const typed = cause as {
    statusCode?: number;
    response?: { status?: number };
  };
  if (typeof typed.statusCode === "number") return typed.statusCode;
  if (typeof typed.response?.status === "number") return typed.response.status;
  return 0;
}

/** Reads a resource through `@inrupt/solid-client`, used where a Blob is easier. */
export async function readFileText(url: string): Promise<string | null> {
  try {
    const blob = await getFile(url, { fetch: getSession().fetch });
    return await blob.text();
  } catch (cause) {
    const status = readStatus(cause);
    if (status === 404) return null;
    const kind = classify(status);
    throw new PodError(
      kind,
      `${POD_ERROR_MESSAGES[kind]} (${status || "network"})`,
      status,
    );
  }
}

export type AclShareResult =
  | "created"
  | "already-present"
  | "unsupported"
  | "no-control";

/**
 * Grants one agent read access to a single resource by writing that resource's own
 * `.acl`, seeded from the inherited container policy.
 *
 * The fallback policy is copied first so the owner keeps their existing rights; only
 * one agent rule is added. When the provider exposes no ACL the caller is told
 * `unsupported` and must ask the owner to configure the Pod by hand. Claiming a share
 * that never landed would be worse than saying so.
 *
 * `agentWebId` is the full WebID, fragment included: `setAgentResourceAccess` matches
 * agents on the exact subject IRI, so stripping `#me` silently grants nobody.
 */
export async function shareWithAgent(
  resourceUrl: string,
  agentWebId: string,
): Promise<AclShareResult> {
  const fetch = getSession().fetch;

  const info = await getResourceInfoWithAcl(resourceUrl, { fetch }).catch(
    (cause: unknown) => {
      throw new PodError(
        classify(readStatus(cause)),
        `${POD_ERROR_MESSAGES[classify(readStatus(cause))]} (ACL ${readStatus(cause) || "network"})`,
        readStatus(cause),
      );
    },
  );

  if (!hasAccessibleAcl(info)) return "no-control";

  const existing = getResourceAcl(info);
  let acl = existing;
  if (acl === null) {
    if (!hasFallbackAcl(info)) return "unsupported";
    acl = createAclFromFallbackAcl(info);
  }

  const granted = setAgentResourceAccess(acl, agentWebId, {
    read: true,
    append: false,
    write: false,
    control: false,
  });

  await saveAclFor(info, granted, { fetch });
  return existing === null ? "created" : "already-present";
}

/**
 * Opens a container so other agents can drop documents into it, and only that.
 *
 * The inbox is the one place a peer must be able to write without the owner handing out
 * individual shares first — an RFQ cannot arrive if every sender needs a manual grant.
 * What it must never become is a place where one peer reads another peer's mail.
 *
 * So the grant is `append` only, on `default` (children created through the container).
 * `read` is deliberately absent: an agent that can read a container can enumerate every
 * document in it, which is the whole inbox. Append-only means a sender can deliver, cannot
 * list, and cannot overwrite an existing name it did not create.
 *
 * `foaf:Agent` is any authenticated agent, which is what "a peer I have not met yet"
 * means in Solid. Anonymous callers still get nothing: the rule names an agent class,
 * not the public.
 *
 * Returns the same honest vocabulary as the other ACL helpers. A provider without WAC
 * answers `unsupported` rather than a silent no.
 */
export async function openInboxForAppend(
  containerUrl: string,
): Promise<AclShareResult> {
  const fetch = getSession().fetch;

  const info = await getResourceInfoWithAcl(containerUrl, { fetch }).catch(
    (cause: unknown) => {
      const status = readStatus(cause);
      throw new PodError(
        classify(status),
        `${POD_ERROR_MESSAGES[classify(status)]} (ACL ${status || "network"})`,
        status,
      );
    },
  );

  if (!hasAccessibleAcl(info)) return "no-control";

  const existing = getResourceAcl(info);
  let acl = existing;
  if (acl === null) {
    if (!hasFallbackAcl(info)) return "unsupported";
    acl = createAclFromFallbackAcl(info);
  }

  const current = getAgentDefaultAccessAll(acl);
  const alreadyOpen = Object.values(current).some((access) => access.append);

  const granted = setAgentDefaultAccess(acl, FOAF_AGENT, {
    read: false,
    append: true,
    write: false,
    control: false,
  });

  await saveAclFor(info, granted, { fetch });
  return alreadyOpen ? "already-present" : "created";
}

/** Same helper for a single inbox document, so a peer cannot rewrite what it sent. */
export async function openResourceForAppend(
  resourceUrl: string,
): Promise<AclShareResult> {
  const fetch = getSession().fetch;

  const info = await getResourceInfoWithAcl(resourceUrl, { fetch }).catch(
    (cause: unknown) => {
      const status = readStatus(cause);
      throw new PodError(
        classify(status),
        `${POD_ERROR_MESSAGES[classify(status)]} (ACL ${status || "network"})`,
        status,
      );
    },
  );

  if (!hasAccessibleAcl(info)) return "no-control";

  const existing = getResourceAcl(info);
  let acl = existing;
  if (acl === null) {
    if (!hasFallbackAcl(info)) return "unsupported";
    acl = createAclFromFallbackAcl(info);
  }

  const granted = setAgentResourceAccess(acl, FOAF_AGENT, {
    read: false,
    append: true,
    write: false,
    control: false,
  });

  await saveAclFor(info, granted, { fetch });
  return existing === null ? "created" : "already-present";
}

/**
 * Makes a resource, and everything in its container, readable by any agent.
 *
 * The public index is the one document a peer is expected to fetch without a WebID.
 * Writing it is not enough: the file inherits the storage root's private policy, so an
 * anonymous GET answers 403 until the owner grants it.
 *
 * Two grants are needed and they are not the same:
 *
 *  - resource access, so the index file itself is readable;
 *  - default access on the container, so a *future* index written to the same
 *    container is readable too. `publishIndex` rewrites the file on every change, and
 *    a per-file ACL does not survive a provider that recreates the resource.
 *
 * Only `read` is granted. Nothing here opens the rest of the container: `default`
 * applies to children of `public/`, which holds no private document by design.
 *
 * Returns `unsupported`/`no-control` instead of guessing: providers that do not expose
 * WAC get an honest "not done" so the UI can tell the owner to use the provider's own
 * sharing switch.
 */
export async function makeResourcePublic(
  resourceUrl: string,
  containerUrl: string,
): Promise<AclShareResult> {
  const fetch = getSession().fetch;

  const [resource, container] = await Promise.all([
    getResourceInfoWithAcl(resourceUrl, { fetch }),
    getResourceInfoWithAcl(containerUrl, { fetch }),
  ]);

  if (!hasAccessibleAcl(resource) || !hasAccessibleAcl(container)) {
    return "no-control";
  }

  // The resource ACL is seeded from the container's inherited policy so the owner
  // keeps their own read/write; the fallback is what carries those rules.
  const resourceAcl = getResourceAcl(resource);
  const seededResource =
    resourceAcl !== null
      ? resourceAcl
      : hasFallbackAcl(resource)
        ? createAclFromFallbackAcl(resource)
        : null;
  if (seededResource === null) return "unsupported";

  const containerAcl = getResourceAcl(container);
  const seededContainer =
    containerAcl !== null
      ? containerAcl
      : hasFallbackAcl(container)
        ? createAclFromFallbackAcl(container)
        : null;
  if (seededContainer === null) return "unsupported";

  const alreadyPublic =
    getPublicResourceAccess(resourceAcl ?? seededResource).read &&
    getPublicDefaultAccess(containerAcl ?? seededContainer).read;

  const nextResource = setPublicResourceAccess(seededResource, {
    read: true,
    append: false,
    write: false,
    control: false,
  });
  const nextContainer = setPublicDefaultAccess(seededContainer, {
    read: true,
    append: false,
    write: false,
    control: false,
  });

  await Promise.all([
    saveAclFor(resource, nextResource, { fetch }),
    saveAclFor(container, nextContainer, { fetch }),
  ]);

  return alreadyPublic ? "already-present" : "created";
}

/** Removes a resource's own ACL, letting it fall back to the container policy. */
export async function revokeAgentShares(resourceUrl: string): Promise<boolean> {
  const fetch = getSession().fetch;
  const aclUrl = `${resourceUrl}.acl`;
  try {
    const response = await fetch(aclUrl, { method: "DELETE" });
    // Removing the resource ACL resets every per-agent grant at once. That is the
    // only revoke Chainify can honestly promise: copies already downloaded elsewhere
    // are outside this Pod's reach.
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
