/**
 * Browser-side repository.
 *
 * All business records live in the signed-in owner's Pod; this module is the only
 * place that knows how they are named, listed, and written. It reads through the
 * session fetch and never calls the Chainify node.
 */

import {
  documentToEvidence,
  documentToListing,
  documentToProfile,
  documentToPublicIndex,
  documentToRfq,
  evidenceToDocument,
  listingToDocument,
  profileToDocument,
  publicIndexToDocument,
  rfqToDocument,
  type PublicIndexEntry,
} from "./models";
import { resolveIdentity } from "./api";
import { MalformedDocumentError } from "./rdf";
import {
  POD_CONTAINERS,
  podPaths,
  uniqueSlug,
  type BusinessProfile,
  type EvidenceCredential,
  type Listing,
  type PodPaths,
  type RfqDelivery,
  type RfqThread,
} from "./vocab";
import {
  deleteDocument,
  ensureContainer,
  listContainer,
  makeResourcePublic,
  openInboxForAppend,
  PodError,
  readDocument,
  writeDocument,
  type AclShareResult,
} from "@/lib/solid/resources";

export interface RepositoryContext {
  storage: string;
  webId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toResourceUrl(container: string, id: string): string {
  return `${container}${id}.jsonld`;
}

/** Creates every Chainify container the app writes into. Safe to call repeatedly. */
export async function preparePod(storage: string): Promise<PodPaths> {
  const paths = podPaths(storage);
  for (const key of POD_CONTAINERS) {
    await ensureContainer(paths[key]);
  }
  return paths;
}

/** Collects readable documents from a container, skipping ones that fail to parse. */
async function readAll<T>(
  containerUrl: string,
  parse: (raw: string, sourceUrl: string) => T,
): Promise<{ items: T[]; skipped: string[] }> {
  const urls = await listContainer(containerUrl);
  const items: T[] = [];
  const skipped: string[] = [];
  // Sequential on purpose: a Pod may be a small provider, and this keeps the burst
  // well under any per-host concurrency limit.
  for (const url of urls) {
    if (!url.endsWith(".jsonld")) continue;
    try {
      const raw = await readDocument(url);
      if (raw === null) continue;
      items.push(parse(raw, url));
    } catch {
      // A single malformed document must not hide the rest of the container.
      skipped.push(url);
    }
  }
  return { items, skipped };
}

/* ---------------------------------------------------------------------------
   Profile
   ------------------------------------------------------------------------ */

export async function loadProfile(ctx: RepositoryContext): Promise<BusinessProfile | null> {
  const paths = podPaths(ctx.storage);
  const raw = await readDocument(paths.profile);
  if (raw === null) return null;
  try {
    return documentToProfile(raw);
  } catch (cause) {
    if (cause instanceof MalformedDocumentError) return null;
    throw cause;
  }
}

export async function saveProfile(
  ctx: RepositoryContext,
  profile: BusinessProfile,
): Promise<void> {
  const paths = await preparePod(ctx.storage);
  const body = profileToDocument(
    { ...profile, updatedAt: nowIso() },
    ctx.webId,
  );
  await writeDocument(paths.profile, body);
}

/* ---------------------------------------------------------------------------
   Listings
   ------------------------------------------------------------------------ */

export interface ListingInput {
  id?: string;
  kind: Listing["kind"];
  title: string;
  category: string;
  description: string;
  quantity: string;
  unit: Listing["unit"];
  price: string;
  currency: string;
  minimumOrder: string;
  location: string;
  visibility: Listing["visibility"];
  createdAt?: string;
}

export async function listListings(
  ctx: RepositoryContext,
): Promise<{ listings: Listing[]; skipped: string[] }> {
  const paths = podPaths(ctx.storage);
  const { items, skipped } = await readAll(paths.listings, documentToListing);
  return {
    listings: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    skipped,
  };
}

export async function saveListing(
  ctx: RepositoryContext,
  input: ListingInput,
): Promise<Listing> {
  const paths = await preparePod(ctx.storage);
  const id = input.id ?? uniqueSlug(input.title, "listing");
  const sourceUrl = toResourceUrl(paths.listings, id);
  const listing: Listing = {
    id,
    kind: input.kind,
    title: input.title,
    category: input.category,
    description: input.description,
    quantity: input.quantity,
    unit: input.unit,
    price: input.price,
    currency: input.currency || "IDR",
    minimumOrder: input.minimumOrder,
    location: input.location,
    visibility: input.visibility,
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    sourceUrl,
  };
  await writeDocument(sourceUrl, listingToDocument(listing));
  return listing;
}

export async function deleteListing(ctx: RepositoryContext, id: string): Promise<void> {
  const paths = podPaths(ctx.storage);
  await deleteDocument(toResourceUrl(paths.listings, id));
}

/* ---------------------------------------------------------------------------
   Evidence
   ------------------------------------------------------------------------ */

export interface EvidenceInput {
  id?: string;
  title: string;
  claim: string;
  issuer: string;
  subject: string;
  issuedAt: string;
  expiresAt: string;
  notes: string;
  visibility: EvidenceCredential["visibility"];
  createdAt?: string;
}

export async function listEvidence(
  ctx: RepositoryContext,
): Promise<{ evidence: EvidenceCredential[]; skipped: string[] }> {
  const paths = podPaths(ctx.storage);
  const { items, skipped } = await readAll(paths.evidence, documentToEvidence);
  return {
    evidence: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    skipped,
  };
}

export async function saveEvidence(
  ctx: RepositoryContext,
  input: EvidenceInput,
): Promise<EvidenceCredential> {
  const paths = await preparePod(ctx.storage);
  const id = input.id ?? uniqueSlug(input.title, "evidence");
  const sourceUrl = toResourceUrl(paths.evidence, id);
  const existing = input.id
    ? await readDocument(sourceUrl).catch(() => null)
    : null;
  let sharedWith: string[] = [];
  if (existing) {
    try {
      sharedWith = documentToEvidence(existing, sourceUrl).sharedWith;
    } catch {
      sharedWith = [];
    }
  }
  const evidence: EvidenceCredential = {
    id,
    title: input.title,
    claim: input.claim,
    issuer: input.issuer,
    subject: input.subject || ctx.webId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    notes: input.notes,
    sharedWith,
    visibility: input.visibility,
    createdAt: input.createdAt ?? nowIso(),
    sourceUrl,
  };
  await writeDocument(sourceUrl, evidenceToDocument(evidence));
  return evidence;
}

export async function deleteEvidence(ctx: RepositoryContext, id: string): Promise<void> {
  const paths = podPaths(ctx.storage);
  await deleteDocument(toResourceUrl(paths.evidence, id));
}

/**
 * Records an explicit share on an evidence document.
 *
 * The list is written into the document itself so the intent travels with the data,
 * then the caller separately grants Pod-level read access. Both steps are needed: a
 * name in a list grants nothing by itself.
 */
export async function recordShare(
  ctx: RepositoryContext,
  id: string,
  agentWebId: string,
): Promise<EvidenceCredential> {
  const paths = podPaths(ctx.storage);
  const sourceUrl = toResourceUrl(paths.evidence, id);
  const raw = await readDocument(sourceUrl);
  if (raw === null) throw new Error("Evidence tidak ditemukan di Pod.");
  const evidence = documentToEvidence(raw, sourceUrl);
  const sharedWith = [...new Set([...evidence.sharedWith, agentWebId])];
  const next: EvidenceCredential = { ...evidence, sharedWith };
  await writeDocument(sourceUrl, evidenceToDocument(next));
  return next;
}

export async function removeShare(
  ctx: RepositoryContext,
  id: string,
  agentWebId: string,
): Promise<EvidenceCredential> {
  const paths = podPaths(ctx.storage);
  const sourceUrl = toResourceUrl(paths.evidence, id);
  const raw = await readDocument(sourceUrl);
  if (raw === null) throw new Error("Evidence tidak ditemukan di Pod.");
  const evidence = documentToEvidence(raw, sourceUrl);
  const next: EvidenceCredential = {
    ...evidence,
    sharedWith: evidence.sharedWith.filter((entry) => entry !== agentWebId),
  };
  await writeDocument(sourceUrl, evidenceToDocument(next));
  return next;
}

/* ---------------------------------------------------------------------------
   RFQ
   ------------------------------------------------------------------------ */

export interface RfqInput {
  id?: string;
  subject: string;
  body: string;
  quantityNote: string;
  counterOffer: string;
  status: RfqThread["status"];
  counterpartyWebId: string;
  listingRef: string;
  listingTitle: string;
  agreedTerms: string;
  deliveries: RfqThread["deliveries"];
  role: RfqThread["role"];
  createdAt?: string;
}

export async function listRfq(
  ctx: RepositoryContext,
  role: RfqThread["role"],
): Promise<{ threads: RfqThread[]; skipped: string[] }> {
  const paths = podPaths(ctx.storage);
  const { items, skipped } = await readAll(paths.rfq, (raw, url) =>
    documentToRfq(raw, url, role),
  );
  return {
    threads: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    skipped,
  };
}

export async function saveRfq(
  ctx: RepositoryContext,
  input: RfqInput,
): Promise<RfqThread> {
  const paths = await preparePod(ctx.storage);
  const id = input.id ?? uniqueSlug(input.subject, "rfq");
  const sourceUrl = toResourceUrl(paths.rfq, id);
  const thread: RfqThread = {
    id,
    subject: input.subject,
    body: input.body,
    quantityNote: input.quantityNote,
    counterOffer: input.counterOffer,
    status: input.status,
    createdAt: input.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    counterpartyWebId: input.counterpartyWebId,
    listingRef: input.listingRef,
    listingTitle: input.listingTitle,
    agreedTerms: input.agreedTerms,
    deliveries: input.deliveries,
    role: input.role,
    sourceUrl,
  };
  await writeDocument(sourceUrl, rfqToDocument(thread));
  return thread;
}

export async function deleteRfq(ctx: RepositoryContext, id: string): Promise<void> {
  const paths = podPaths(ctx.storage);
  await deleteDocument(toResourceUrl(paths.rfq, id));
}

export type RfqDeliveryOutcome = {
  /** Mirrors the copy's own `deliveries` log, newest last. */
  delivery: RfqDelivery;
  /** Set when the far side actually accepted the document. */
  delivered: boolean;
};

/**
 * Copies one RFQ into the counterparty's `chainify/inbox/`.
 *
 * Chainify has no mail server: this is a plain authenticated PUT to the other party's
 * Pod, so it only succeeds when their ACL allows the sender to write. Two steps matter
 * and both can fail honestly:
 *
 *  1. the WebID is resolved through the node, because a WebID is an identity, not a
 *     storage location, and guessing `<origin>/<name>/` would be a wild guess;
 *  2. the write is attempted as-is. A 401/403 is the normal answer for a Pod that has
 *     not granted write access, and it is recorded as such instead of being retried
 *     or dressed up as success.
 *
 * The local copy always gets the outcome appended, so the sender can see what really
 * happened weeks later without going back to the network.
 */
export async function deliverRfq(
  ctx: RepositoryContext,
  thread: RfqThread,
  counterpartyWebId: string,
  inboxContainerUrl?: string,
): Promise<RfqDeliveryOutcome> {
  const at = nowIso();
  const target = inboxContainerUrl?.trim() || "";

  if (!counterpartyWebId) {
    return {
      delivered: false,
      delivery: {
        at,
        ok: false,
        target,
        detail: "WebID lawan bicara belum diisi, jadi tidak ada tujuan pengiriman.",
      },
    };
  }

  let inbox = target;
  if (!inbox) {
    let storage: string | undefined;
    try {
      const identity = await resolveIdentity(counterpartyWebId);
      storage = identity.storage?.[0];
    } catch (cause) {
      return {
        delivered: false,
        delivery: {
          at,
          ok: false,
          target: counterpartyWebId,
          detail: `WebID tidak dapat di-resolve: ${causeText(cause)}`,
        },
      };
    }
    if (!storage) {
      return {
        delivered: false,
        delivery: {
          at,
          ok: false,
          target: counterpartyWebId,
          detail:
            "Profil lawan bicara tidak menyebut storage Pod, jadi tidak ada alamat tujuan.",
        },
      };
    }
    inbox = podPaths(storage).inbox;
  }

  const destination = `${inbox.replace(/\/+$/, "")}/${thread.id}.jsonld`;

  // The copy that travels is the buyer-facing one regardless of which side sends it:
  // whoever receives it sees a complete thread, not half a conversation.
  const outgoing: RfqThread = {
    ...thread,
    role: thread.role === "buyer" ? "seller" : "buyer",
    sourceUrl: destination,
    updatedAt: at,
  };

  let ok = false;
  let detail: string;
  try {
    await writeDocument(destination, rfqToDocument(outgoing));
    ok = true;
    detail = "Salinan diterima di inbox tujuan.";
  } catch (cause) {
    detail =
      cause instanceof PodError && (cause.kind === "forbidden" || cause.kind === "unauthorized")
        ? "Pod tujuan menolak tulisan. Pemiliknya harus memberi akses tulis ke inbox mereka."
        : `Pengiriman gagal: ${causeText(cause)}`;
  }

  const delivery: RfqDelivery = { at, ok, target: destination, detail };

  // The log is part of the local copy, so it is written even when the far side refused:
  // a failed attempt is information the sender needs.
  await saveRfq(ctx, {
    id: thread.id,
    subject: thread.subject,
    body: thread.body,
    quantityNote: thread.quantityNote,
    counterOffer: thread.counterOffer,
    status: ok && thread.status === "draft" ? "sent" : thread.status,
    counterpartyWebId,
    listingRef: thread.listingRef,
    listingTitle: thread.listingTitle,
    agreedTerms: thread.agreedTerms,
    deliveries: [...thread.deliveries, delivery],
    role: thread.role,
    createdAt: thread.createdAt,
  });

  return { delivery, delivered: ok };
}

/* ---------------------------------------------------------------------------
   Inbox
   ------------------------------------------------------------------------ */

export interface InboxEntry {
  /** Resource name without `.jsonld`, used as the route id. */
  id: string;
  sourceUrl: string;
  thread: RfqThread;
  /** Set when the document is in the inbox but already has a copy in `rfq/`. */
  claimed: boolean;
}

/**
 * Lists the documents peers have delivered into this owner's inbox.
 *
 * The inbox is the receiving half of `deliverRfq`. It is read with the owner's own
 * session, so the whole container is visible here even though peers can only append to
 * it: the sender's inability to enumerate is an ACL property, not a UI one.
 *
 * A document whose name already matches a thread in `rfq/` is marked `claimed`. That is
 * how the owner can tell a delivery they have accepted from one still sitting unread —
 * the inbox document itself is never moved, because the sender's record points at this
 * URL and moving it would break their delivery log.
 */
export async function listInbox(
  ctx: RepositoryContext,
): Promise<{ entries: InboxEntry[]; skipped: string[] }> {
  const paths = podPaths(ctx.storage);

  const [received, own] = await Promise.all([
    readAll(paths.inbox, (raw, url) => documentToRfq(raw, url, "seller")),
    readAll(paths.rfq, (raw, url) => documentToRfq(raw, url, "seller")),
  ]);

  const claimedIds = new Set(own.items.map((thread) => thread.id));

  return {
    entries: received.items
      .map((thread) => ({
        id: thread.id,
        sourceUrl: thread.sourceUrl,
        thread,
        claimed: claimedIds.has(thread.id),
      }))
      .sort((a, b) => b.thread.updatedAt.localeCompare(a.thread.updatedAt)),
    // Only inbox documents matter here. A `rfq/` container that does not exist yet is
    // the normal first-run state and says nothing about what arrived.
    skipped: received.skipped,
  };
}

/**
 * Opens this owner's inbox so peers can append to it, and nothing more.
 *
 * Called from the inbox page rather than at Pod setup on purpose: granting append to
 * every authenticated agent is a decision about receiving mail, and it should be made
 * with the same visibility as any other sharing control, not silently during first run.
 */
export async function openInbox(ctx: RepositoryContext): Promise<AclShareResult> {
  const paths = await preparePod(ctx.storage);
  return openInboxForAppend(paths.inbox);
}

/**
 * Copies an inbox document into the owner's own `rfq/` so it can be answered.
 *
 * The copy is stored under the same id, which is what marks it claimed: the inbox
 * document stays where the sender put it, and the owner's working copy is theirs to
 * edit. Answering is a separate `deliverRfq` back to the sender's WebID, so a reply
 * travels the same authenticated path as the original.
 */
export async function claimInboxEntry(
  ctx: RepositoryContext,
  entry: InboxEntry,
): Promise<RfqThread> {
  const paths = podPaths(ctx.storage);
  const sourceUrl = toResourceUrl(paths.rfq, entry.id);

  const claimed: RfqThread = {
    ...entry.thread,
    role: "seller",
    sourceUrl,
    // The owner's copy should read as a live thread, not as an unreviewed draft.
    status: entry.thread.status === "draft" ? "answered" : entry.thread.status,
    updatedAt: nowIso(),
  };

  // The document is written before the container is prepared. Provisioning touches
  // containers this operation does not need — `public/` among them — and a failure
  // there must not discard a claim that already landed.
  await writeDocument(sourceUrl, rfqToDocument(claimed));
  await preparePod(ctx.storage).catch(() => undefined);
  return claimed;
}

function causeText(cause: unknown): string {
  if (cause instanceof PodError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return "kesalahan tidak dikenal";
}

/* ---------------------------------------------------------------------------
   Public index
   ------------------------------------------------------------------------ */

/**
 * Rewrites `chainify/public/index.jsonld` from what the owner marked discoverable.
 *
 * The index is the only document a peer needs to guess. Rebuilding it on every write
 * keeps it from drifting away from the actual listings, and an owner who turns every
 * listing private leaves behind an index that says so instead of stale entries.
 *
 * Writing the document is not publishing it. The storage root is private by default, so
 * an anonymous peer gets 403 until the index and its container carry a public read
 * rule. `publicRead` reports what actually happened, including a provider that refuses
 * to expose its ACL: the caller must not claim "published" on a 403.
 */
export async function publishIndex(ctx: RepositoryContext): Promise<{
  entries: number;
  url: string;
  publicRead: AclShareResult;
}> {
  const paths = await preparePod(ctx.storage);

  const [profile, listings] = await Promise.all([
    loadProfile(ctx),
    listListings(ctx),
  ]);

  const entries: PublicIndexEntry[] = [];
  const displayName = profile?.name ?? "Bisnis tanpa nama";
  if (profile?.discoverable) {
    entries.push({
      // The subject of the profile document is the WebID itself, so the entry points
      // at the profile resource a peer must fetch to read the rest.
      url: paths.profile,
      title: displayName,
      kind: "profile",
      category: profile.sector,
      location: profile.location,
    });
  }

  for (const listing of listings.listings) {
    if (listing.visibility !== "discoverable") continue;
    entries.push({
      url: listing.sourceUrl,
      title: listing.title,
      kind: "listing",
      category: listing.category,
      location: listing.location,
      quantity: listing.quantity,
      unit: listing.unit,
    });
  }

  const body = publicIndexToDocument({
    webId: ctx.webId,
    displayName,
    publishedAt: nowIso(),
    entries,
  });
  await writeDocument(paths.publicIndex, body);

  // Public read is granted explicitly, never assumed. A provider without WAC answers
  // `unsupported` and the page tells the owner to use its own sharing control.
  const publicRead = await makeResourcePublic(paths.publicIndex, paths.publicDir);

  return { entries: entries.length, url: paths.publicIndex, publicRead };
}

/** Reads a public index without needing to be its owner (used for peer previews). */
export function parsePublicIndex(raw: string) {
  return documentToPublicIndex(raw);
}

/**
 * Lists the ids of resources kept in a container whose documents failed to parse.
 * The UI surfaces these instead of silently showing a shorter list.
 */
export function describeSkipped(skipped: readonly string[]): string[] {
  return skipped.map((url) => url.split("/").pop() ?? url);
}
