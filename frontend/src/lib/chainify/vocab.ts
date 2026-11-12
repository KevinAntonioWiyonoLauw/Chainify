/**
 * Chainify vocabulary.
 *
 * The project docs require two things at once: interoperable RDF/JSON-LD for the
 * domain values (offer name, price, quantity, location), and no invented production
 * ontology presented as a standard. So the shape is split:
 *
 *  - `schema:` (https://schema.org/) carries everything a generic RDF consumer could
 *    already understand: name, description, category, price, quantity, unit, area.
 *  - `cfy:` (`https://chainify.local/ns#`) carries only what Schema.org has no
 *    property for: the visibility flag, the coarse location, minimum order, and the
 *    WebID that owns the resource.
 *
 * `cfy:` is a project namespace on a host this prototype controls. It is documented
 * as prototype-scoped in `docs/dev/05-vocabulary-chainify.md` and is not claimed to be
 * a published vocabulary. Nothing outside these two prefixes is required to read a
 * listing, so a partner implementation can map `schema:` and ignore `cfy:` without
 * losing the business fields.
 */

export const SCHEMA = "https://schema.org/";
export const CFY = "https://chainify.local/ns#";

/** Compact JSON-LD keys, mirroring `CHAINIFY_CONTEXT`. */
export const CFY_TERMS = {
  visibility: "cfy:visibility",
  generalLocation: "cfy:generalLocation",
  minimumOrder: "cfy:minimumOrder",
  ownerWebId: "cfy:ownerWebId",
  kind: "cfy:kind",
  issuer: "cfy:issuer",
  claim: "cfy:claim",
  subject: "cfy:subject",
  issuedAt: "cfy:issuedAt",
  expiresAt: "cfy:expiresAt",
  references: "cfy:references",
  note: "cfy:note",
  requestedBy: "cfy:requestedBy",
  requestedFrom: "cfy:requestedFrom",
  resourceRef: "cfy:resourceRef",
  status: "cfy:status",
  sender: "cfy:sender",
  recipient: "cfy:recipient",
  generatedAt: "cfy:generatedAt",
  item: "cfy:item",
  counterOffer: "cfy:counterOffer",
  agreedTerms: "cfy:agreedTerms",
  listingRef: "cfy:listingRef",
  listingTitle: "cfy:listingTitle",
  quantityNote: "cfy:quantityNote",
  delivery: "cfy:delivery",
  deliveryOk: "cfy:deliveryOk",
  deliveryTarget: "cfy:deliveryTarget",
  deliveryDetail: "cfy:deliveryDetail",
} as const;

export const SCHEMA_TERMS = {
  Offer: "schema:Offer",
  Demand: "schema:Demand",
  BusinessFunction: "schema:BusinessFunction",
  Person: "schema:Person",
  Organization: "schema:Organization",
  LocalBusiness: "schema:LocalBusiness",
  CreativeWork: "schema:CreativeWork",
  Message: "schema:Message",
  QuantitativeValue: "schema:QuantitativeValue",
  name: "schema:name",
  description: "schema:description",
  category: "schema:category",
  price: "schema:price",
  priceCurrency: "schema:priceCurrency",
  availability: "schema:availability",
  areaServed: "schema:areaServed",
  email: "schema:email",
  telephone: "schema:telephone",
  url: "schema:url",
  value: "schema:value",
  unitText: "schema:unitText",
  quantitativeValue: "schema:quantitativeValue",
  dateCreated: "schema:dateCreated",
  dateModified: "schema:dateModified",
  text: "schema:text",
  publisher: "schema:publisher",
  recipient: "schema:recipient",
  sender: "schema:sender",
} as const;

/** JSON-LD `@context` block shared by every Chainify resource document. */
export const CHAINIFY_CONTEXT = {
  schema: SCHEMA,
  cfy: CFY,
} as const;

export type Visibility = "discoverable" | "private";
export type ListingKind = "offer" | "demand";
export type ListingUnit = "kg" | "ton" | "liter" | "pcs" | "unit" | "batch";

export const LISTING_UNITS: readonly ListingUnit[] = [
  "kg",
  "ton",
  "liter",
  "pcs",
  "unit",
  "batch",
];

export const LISTING_CATEGORIES = [
  "Bahan baku pangan",
  "Bahan baku non-pangan",
  "Bahan sampingan / by-product",
  "Kapasitas produksi",
  "Jasa maklon",
  "Kemasan",
  "Logistik",
  "Lainnya",
] as const;

export const BUSINESS_SECTORS = [
  "Pengolahan kopi",
  "Pengolahan pangan",
  "Pengolahan non-pangan",
  "Kerajinan",
  "Tekstil",
  "Percetakan",
  "Logistik",
  "Lainnya",
] as const;

export interface BusinessProfile {
  name: string;
  sector: string;
  description: string;
  /** Coarse location only: kecamatan/kabupaten scale, never a street address. */
  location: string;
  email: string;
  phone: string;
  website: string;
  /** Whether the profile itself may appear in the public index. */
  discoverable: boolean;
  updatedAt: string;
}

export interface Listing {
  /** Resource slug; becomes `<slug>.jsonld` under the listings container. */
  id: string;
  kind: ListingKind;
  title: string;
  category: string;
  description: string;
  quantity: string;
  unit: ListingUnit;
  /** Indicative price. Free text so "nego" and "Rp 90.000/kg" both survive. */
  price: string;
  currency: string;
  minimumOrder: string;
  location: string;
  visibility: Visibility;
  updatedAt: string;
  createdAt: string;
  /** Absolute URL of the resource in the owner's Pod. */
  sourceUrl: string;
}

export interface EvidenceCredential {
  id: string;
  title: string;
  /** The single factual claim the document contains. */
  claim: string;
  /** Who issued it, as free text; this is not a trusted-issuer registry. */
  issuer: string;
  /** Subject IRI the claim is about, usually the owner's WebID. */
  subject: string;
  issuedAt: string;
  expiresAt: string;
  notes: string;
  /** WebIDs the owner explicitly shared this evidence with. */
  sharedWith: string[];
  visibility: Visibility;
  createdAt: string;
  sourceUrl: string;
}

export type RfqStatus = "draft" | "sent" | "answered" | "declined" | "agreed";

export const RFQ_STATUS_LABEL: Record<RfqStatus, string> = {
  draft: "Draf",
  sent: "Terkirim",
  answered: "Dijawab",
  declined: "Ditolak",
  agreed: "Sepakat",
};

export interface RfqDelivery {
  at: string;
  ok: boolean;
  target: string;
  detail?: string;
}

export interface RfqThread {
  id: string;
  /** Buyer's subject line, kept verbatim so the seller sees the original wording. */
  subject: string;
  body: string;
  quantityNote: string;
  counterOffer: string;
  status: RfqStatus;
  createdAt: string;
  updatedAt: string;
  /** WebID of the other party, in whichever direction this copy was written. */
  counterpartyWebId: string;
  listingRef: string;
  listingTitle: string;
  agreedTerms: string;
  deliveries: RfqDelivery[];
  /** Which Pod holds this copy: the buyer's or the seller's. */
  role: "buyer" | "seller";
  sourceUrl: string;
}

export interface PodPaths {
  root: string;
  chainify: string;
  profile: string;
  listings: string;
  requirements: string;
  evidence: string;
  rfq: string;
  inbox: string;
  publicDir: string;
  publicIndex: string;
}

/** Normalises a Pod storage URL into the container paths Chainify writes to. */
export function podPaths(storage: string): PodPaths {
  const root = `${storage.replace(/\/+$/, "")}/`;
  const chainify = `${root}chainify/`;
  const publicDir = `${chainify}public/`;
  return {
    root,
    chainify,
    profile: `${chainify}profile/business-profile.jsonld`,
    listings: `${chainify}listings/`,
    requirements: `${chainify}requirements/`,
    evidence: `${chainify}evidence/`,
    rfq: `${chainify}rfq/`,
    inbox: `${chainify}inbox/`,
    publicDir,
    publicIndex: `${publicDir}index.jsonld`,
  };
}

/** Container keys, in the order they must be created on a fresh Pod. */
export const POD_CONTAINERS: readonly (keyof Pick<
  PodPaths,
  "chainify" | "listings" | "requirements" | "evidence" | "rfq" | "inbox" | "publicDir"
>)[] = ["chainify", "listings", "requirements", "evidence", "rfq", "inbox", "publicDir"];

/** Turns free text into a stable, URL-safe slug used as the resource name. */
export function slugify(input: string, fallback: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || fallback;
}

/** Appends a short random suffix so two same-titled resources never collide. */
export function uniqueSlug(input: string, fallback: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slugify(input, fallback)}-${suffix}`;
}
