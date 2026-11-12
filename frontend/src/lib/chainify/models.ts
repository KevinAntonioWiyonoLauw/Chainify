/**
 * Mapping between Chainify domain objects and the JSON-LD documents stored in a Pod.
 *
 * Every function here is pure: given an object it returns the exact text that will be
 * PUT, and given that text it returns the object back. Keeping the mapping in one place
 * means the shape shown in the UI is the shape on disk, and a change to the vocabulary
 * is a change to a single file.
 */

import {
  CHAINIFY_CONTEXT,
  CFY_TERMS,
  SCHEMA_TERMS,
  type BusinessProfile,
  type EvidenceCredential,
  type Listing,
  type ListingKind,
  type ListingUnit,
  type RfqDelivery,
  type RfqStatus,
  type RfqThread,
  type Visibility,
} from "./vocab";
import {
  asNode,
  parseDocument,
  readQuantity,
  readString,
  readStrings,
  safeTimestamp,
  serializeDocument,
  type JsonLdNode,
  type JsonLdValue,
} from "./rdf";

/** Numeric id list helper: JSON-LD always carries arrays for repeatable properties. */
function asArray(values: readonly string[]): string[] {
  return values.filter((value) => value.trim().length > 0);
}

function visibilityOf(raw: string): Visibility {
  // Opt-in, not opt-out: a missing or unrecognised flag means private, so a document
  // written by another tool can never become discoverable through a typo.
  return raw === "discoverable" ? "discoverable" : "private";
}

function kindOf(raw: string): ListingKind {
  return raw === "demand" ? "demand" : "offer";
}

function unitOf(raw: string): ListingUnit {
  const allowed: ListingUnit[] = ["kg", "ton", "liter", "pcs", "unit", "batch"];
  return allowed.includes(raw as ListingUnit) ? (raw as ListingUnit) : "kg";
}

function deliveryToNode(delivery: RfqDelivery): JsonLdNode {
  return {
    [CFY_TERMS.deliveryOk]: delivery.ok,
    [CFY_TERMS.deliveryTarget]: delivery.target,
    [CFY_TERMS.deliveryDetail]: delivery.detail ?? "",
    [CFY_TERMS.generatedAt]: delivery.at,
  };
}

function nodeToDelivery(node: JsonLdNode): RfqDelivery {
  return {
    ok: readString(node, CFY_TERMS.deliveryOk) === "true",
    target: readString(node, CFY_TERMS.deliveryTarget),
    detail: readString(node, CFY_TERMS.deliveryDetail) || undefined,
    at: safeTimestamp(readString(node, CFY_TERMS.generatedAt)),
  };
}

/* ---------------------------------------------------------------------------
   Business profile
   ------------------------------------------------------------------------ */

export function profileToDocument(profile: BusinessProfile, webId: string): string {
  // A profile describes the owner, so the subject is their WebID rather than the
  // document URL. Consumers can therefore match a profile to a Person immediately.
  const node: JsonLdNode = {
    "@context": CHAINIFY_CONTEXT,
    "@id": webId,
    "@type": SCHEMA_TERMS.Person,
    [SCHEMA_TERMS.name]: profile.name,
    [SCHEMA_TERMS.description]: profile.description,
    [SCHEMA_TERMS.category]: profile.sector,
    [SCHEMA_TERMS.areaServed]: profile.location,
    [CFY_TERMS.ownerWebId]: webId,
    [CFY_TERMS.visibility]: profile.discoverable ? "discoverable" : "private",
    [SCHEMA_TERMS.dateModified]: profile.updatedAt,
  };
  if (profile.email) node[SCHEMA_TERMS.email] = profile.email;
  if (profile.phone) node[SCHEMA_TERMS.telephone] = profile.phone;
  if (profile.website) node[SCHEMA_TERMS.url] = profile.website;
  return serializeDocument(node);
}

export function documentToProfile(raw: string): BusinessProfile {
  const { node } = parseDocument(raw);
  return {
    name: readString(node, SCHEMA_TERMS.name),
    sector: readString(node, SCHEMA_TERMS.category),
    description: readString(node, SCHEMA_TERMS.description),
    location: readString(node, SCHEMA_TERMS.areaServed),
    email: readString(node, SCHEMA_TERMS.email),
    phone: readString(node, SCHEMA_TERMS.telephone),
    website: readString(node, SCHEMA_TERMS.url),
    discoverable: visibilityOf(readString(node, CFY_TERMS.visibility)) === "discoverable",
    updatedAt: safeTimestamp(readString(node, SCHEMA_TERMS.dateModified)),
  };
}

/* ---------------------------------------------------------------------------
   Listing (offer or demand)
   ------------------------------------------------------------------------ */

export function listingToDocument(listing: Listing): string {
  const type =
    listing.kind === "demand" ? SCHEMA_TERMS.Demand : SCHEMA_TERMS.Offer;
  const node: JsonLdNode = {
    "@context": CHAINIFY_CONTEXT,
    "@id": listing.sourceUrl,
    "@type": type,
    [CFY_TERMS.kind]: listing.kind,
    [SCHEMA_TERMS.name]: listing.title,
    [SCHEMA_TERMS.category]: listing.category,
    [SCHEMA_TERMS.description]: listing.description,
    [SCHEMA_TERMS.quantitativeValue]: {
      "@type": SCHEMA_TERMS.QuantitativeValue,
      [SCHEMA_TERMS.value]: listing.quantity,
      [SCHEMA_TERMS.unitText]: listing.unit,
    },
    [CFY_TERMS.visibility]: listing.visibility,
    [CFY_TERMS.minimumOrder]: listing.minimumOrder,
    [CFY_TERMS.generalLocation]: listing.location,
    [SCHEMA_TERMS.dateCreated]: listing.createdAt,
    [SCHEMA_TERMS.dateModified]: listing.updatedAt,
  };
  if (listing.price) {
    node[SCHEMA_TERMS.price] = listing.price;
    node[SCHEMA_TERMS.priceCurrency] = listing.currency || "IDR";
  }
  return serializeDocument(node);
}

export function documentToListing(raw: string, sourceUrl: string): Listing {
  const { node } = parseDocument(raw);
  const quantity = readQuantity(node, SCHEMA_TERMS.quantitativeValue);
  return {
    id: sourceUrl.split("/").pop()?.replace(/\.jsonld$/, "") ?? "",
    kind: kindOf(readString(node, CFY_TERMS.kind)),
    title: readString(node, SCHEMA_TERMS.name),
    category: readString(node, SCHEMA_TERMS.category),
    description: readString(node, SCHEMA_TERMS.description),
    quantity: quantity.value,
    unit: unitOf(quantity.unit),
    price: readString(node, SCHEMA_TERMS.price),
    currency: readString(node, SCHEMA_TERMS.priceCurrency) || "IDR",
    minimumOrder: readString(node, CFY_TERMS.minimumOrder),
    location: readString(node, CFY_TERMS.generalLocation),
    visibility: visibilityOf(readString(node, CFY_TERMS.visibility)),
    updatedAt: safeTimestamp(readString(node, SCHEMA_TERMS.dateModified)),
    createdAt: safeTimestamp(readString(node, SCHEMA_TERMS.dateCreated)),
    sourceUrl,
  };
}

/* ---------------------------------------------------------------------------
   Evidence
   ------------------------------------------------------------------------ */

export function evidenceToDocument(evidence: EvidenceCredential): string {
  // Modelled as a CreativeWork: Chainify does not define a credential format, and
  // claiming one would imply validation this project does not perform.
  const node: JsonLdNode = {
    "@context": CHAINIFY_CONTEXT,
    "@id": evidence.sourceUrl,
    "@type": SCHEMA_TERMS.CreativeWork,
    [SCHEMA_TERMS.name]: evidence.title,
    [CFY_TERMS.claim]: evidence.claim,
    [CFY_TERMS.issuer]: evidence.issuer,
    [CFY_TERMS.subject]: evidence.subject,
    [CFY_TERMS.issuedAt]: evidence.issuedAt,
    [CFY_TERMS.expiresAt]: evidence.expiresAt,
    [CFY_TERMS.note]: evidence.notes,
    [CFY_TERMS.visibility]: evidence.visibility,
    [SCHEMA_TERMS.dateCreated]: evidence.createdAt,
  };
  const shared = asArray(evidence.sharedWith);
  if (shared.length > 0) node[CFY_TERMS.references] = shared;
  return serializeDocument(node);
}

export function documentToEvidence(raw: string, sourceUrl: string): EvidenceCredential {
  const { node } = parseDocument(raw);
  return {
    id: sourceUrl.split("/").pop()?.replace(/\.jsonld$/, "") ?? "",
    title: readString(node, SCHEMA_TERMS.name),
    claim: readString(node, CFY_TERMS.claim),
    issuer: readString(node, CFY_TERMS.issuer),
    subject: readString(node, CFY_TERMS.subject),
    issuedAt: readString(node, CFY_TERMS.issuedAt),
    expiresAt: readString(node, CFY_TERMS.expiresAt),
    notes: readString(node, CFY_TERMS.note),
    sharedWith: readStrings(node, CFY_TERMS.references),
    visibility: visibilityOf(readString(node, CFY_TERMS.visibility)),
    createdAt: safeTimestamp(readString(node, SCHEMA_TERMS.dateCreated)),
    sourceUrl,
  };
}

/* ---------------------------------------------------------------------------
   RFQ thread
   ------------------------------------------------------------------------ */

const RFQ_STATUSES: readonly RfqStatus[] = [
  "draft",
  "sent",
  "answered",
  "declined",
  "agreed",
];

function statusOf(raw: string): RfqStatus {
  return RFQ_STATUSES.includes(raw as RfqStatus) ? (raw as RfqStatus) : "draft";
}

export function rfqToDocument(thread: RfqThread): string {
  const node: JsonLdNode = {
    "@context": CHAINIFY_CONTEXT,
    "@id": thread.sourceUrl,
    "@type": SCHEMA_TERMS.Message,
    [SCHEMA_TERMS.name]: thread.subject,
    [SCHEMA_TERMS.text]: thread.body,
    [CFY_TERMS.status]: thread.status,
    [CFY_TERMS.quantityNote]: thread.quantityNote,
    [CFY_TERMS.counterOffer]: thread.counterOffer,
    [CFY_TERMS.agreedTerms]: thread.agreedTerms,
    [CFY_TERMS.listingRef]: thread.listingRef,
    [CFY_TERMS.listingTitle]: thread.listingTitle,
    [CFY_TERMS.ownerWebId]: thread.counterpartyWebId,
    [SCHEMA_TERMS.dateCreated]: thread.createdAt,
    [SCHEMA_TERMS.dateModified]: thread.updatedAt,
  };
  if (thread.deliveries.length > 0) {
    node[CFY_TERMS.delivery] = thread.deliveries.map(
      (delivery) => deliveryToNode(delivery) as unknown as JsonLdValue,
    );
  }
  return serializeDocument(node);
}

export function documentToRfq(
  raw: string,
  sourceUrl: string,
  role: "buyer" | "seller",
): RfqThread {
  const { node } = parseDocument(raw);
  const deliveriesRaw = node[CFY_TERMS.delivery];
  const deliveries = Array.isArray(deliveriesRaw)
    ? deliveriesRaw
        .map(asNode)
        .filter((item): item is JsonLdNode => item !== null)
        .map(nodeToDelivery)
    : [];
  return {
    id: sourceUrl.split("/").pop()?.replace(/\.jsonld$/, "") ?? "",
    subject: readString(node, SCHEMA_TERMS.name),
    body: readString(node, SCHEMA_TERMS.text),
    quantityNote: readString(node, CFY_TERMS.quantityNote),
    counterOffer: readString(node, CFY_TERMS.counterOffer),
    status: statusOf(readString(node, CFY_TERMS.status)),
    createdAt: safeTimestamp(readString(node, SCHEMA_TERMS.dateCreated)),
    updatedAt: safeTimestamp(readString(node, SCHEMA_TERMS.dateModified)),
    counterpartyWebId: readString(node, CFY_TERMS.ownerWebId),
    listingRef: readString(node, CFY_TERMS.listingRef),
    listingTitle: readString(node, CFY_TERMS.listingTitle),
    agreedTerms: readString(node, CFY_TERMS.agreedTerms),
    deliveries,
    role,
    sourceUrl,
  };
}

/* ---------------------------------------------------------------------------
   Public index
   ------------------------------------------------------------------------ */

export interface PublicIndexEntry {
  /** Absolute URL of the resource that carries the full document. */
  url: string;
  title: string;
  kind: "profile" | "listing";
  category: string;
  location: string;
  unit?: string;
  quantity?: string;
}

export interface PublicIndex {
  webId: string;
  displayName: string;
  publishedAt: string;
  entries: PublicIndexEntry[];
}

/**
 * Builds the deliberately small document a peer reads to discover this business.
 *
 * It contains what the owner opted into and nothing else: no contacts, no notes, no
 * prices beyond what a listing already marks discoverable. Prices stay in the listing
 * so a business can change a price without republishing the index.
 */
export function publicIndexToDocument(index: PublicIndex): string {
  const node: JsonLdNode = {
    "@context": CHAINIFY_CONTEXT,
    "@id": `${index.webId}#index`,
    "@type": SCHEMA_TERMS.BusinessFunction,
    [CFY_TERMS.ownerWebId]: index.webId,
    [SCHEMA_TERMS.name]: index.displayName,
    [CFY_TERMS.generatedAt]: index.publishedAt,
    [CFY_TERMS.item]: index.entries.map((entry) => ({
      "@id": entry.url,
      [SCHEMA_TERMS.name]: entry.title,
      [SCHEMA_TERMS.category]: entry.category,
      [CFY_TERMS.generalLocation]: entry.location,
      [CFY_TERMS.kind]: entry.kind,
      ...(entry.quantity
        ? {
            [SCHEMA_TERMS.quantitativeValue]: {
              "@type": SCHEMA_TERMS.QuantitativeValue,
              [SCHEMA_TERMS.value]: entry.quantity,
              [SCHEMA_TERMS.unitText]: entry.unit ?? "",
            },
          }
        : {}),
    })),
  };
  return serializeDocument(node);
}

export function documentToPublicIndex(raw: string): PublicIndex {
  const { node } = parseDocument(raw);
  const itemsRaw = node[CFY_TERMS.item];
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.map(asNode).filter((item): item is JsonLdNode => item !== null)
    : [];
  return {
    webId: readString(node, CFY_TERMS.ownerWebId),
    displayName: readString(node, SCHEMA_TERMS.name),
    publishedAt: safeTimestamp(readString(node, CFY_TERMS.generatedAt)),
    entries: items.map((item) => {
      const quantity = readQuantity(item, SCHEMA_TERMS.quantitativeValue);
      const kindRaw = readString(item, CFY_TERMS.kind);
      return {
        url: typeof item["@id"] === "string" ? item["@id"] : "",
        title: readString(item, SCHEMA_TERMS.name),
        kind: kindRaw === "listing" ? "listing" : "profile",
        category: readString(item, SCHEMA_TERMS.category),
        location: readString(item, CFY_TERMS.generalLocation),
        quantity: quantity.value || undefined,
        unit: quantity.unit || undefined,
      };
    }),
  };
}
