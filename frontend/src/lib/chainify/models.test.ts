import { describe, expect, it } from "vitest";
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
  type PublicIndex,
} from "./models";
import type {
  BusinessProfile,
  EvidenceCredential,
  Listing,
  RfqThread,
} from "./vocab";
import { CFY_TERMS, SCHEMA_TERMS } from "./vocab";

const WEB_ID = "https://pod.example/alice/profile/card#me";

const profile: BusinessProfile = {
  name: "Koperasi Tani Gayo",
  sector: "Pengolahan kopi",
  description: "Pengolahan pascapanen kopi arabika.",
  location: "Kabupaten Aceh Tengah",
  email: "halo@tanigayo.example",
  phone: "+62 811 000 000",
  website: "https://tanigayo.example",
  discoverable: true,
  updatedAt: "2026-03-01T10:00:00+07:00",
};

const listing: Listing = {
  id: "kopi-gayo-abc123",
  kind: "offer",
  title: "Green bean Gayo",
  category: "Bahan baku pangan",
  description: "Sortasi basah, kadar air 11%.",
  quantity: "500",
  unit: "kg",
  price: "85000",
  currency: "IDR",
  minimumOrder: "100 kg",
  location: "Aceh Tengah",
  visibility: "discoverable",
  createdAt: "2026-02-01T08:00:00+07:00",
  updatedAt: "2026-03-01T09:00:00+07:00",
  sourceUrl: "https://pod.example/alice/chainify/listings/kopi-gayo-abc123.jsonld",
};

const evidence: EvidenceCredential = {
  id: "halal-mui-abc123",
  title: "Sertifikat halal",
  claim: "Produk bersertifikat halal MUI.",
  issuer: "MUI",
  subject: WEB_ID,
  issuedAt: "2025-06-01",
  expiresAt: "",
  notes: "",
  sharedWith: [WEB_ID],
  visibility: "private",
  createdAt: "2026-03-01T09:00:00+07:00",
  sourceUrl: "https://pod.example/alice/chainify/evidence/halal-mui-abc123.jsonld",
};

const rfq: RfqThread = {
  id: "permintaan-kopi-abc123",
  subject: "Permintaan 200 kg",
  body: "Bisa kirim minggu depan?",
  quantityNote: "200 kg",
  counterOffer: "",
  status: "sent",
  createdAt: "2026-03-02T08:00:00+07:00",
  updatedAt: "2026-03-02T08:00:00+07:00",
  counterpartyWebId: "https://pod.example/bob/profile/card#me",
  listingRef: listing.sourceUrl,
  listingTitle: listing.title,
  agreedTerms: "",
  deliveries: [],
  role: "buyer",
  sourceUrl: "https://pod.example/alice/chainify/rfq/permintaan-kopi-abc123.jsonld",
};

describe("profile mapping", () => {
  it("uses the WebID as the subject, not the document URL", () => {
    const node = JSON.parse(profileToDocument(profile, WEB_ID));
    expect(node["@id"]).toBe(WEB_ID);
    expect(node["@type"]).toBe(SCHEMA_TERMS.Person);
  });

  it("round-trips every field", () => {
    expect(documentToProfile(profileToDocument(profile, WEB_ID))).toEqual({
      ...profile,
      updatedAt: "2026-03-01T03:00:00.000Z",
    });
  });

  it("omits contact properties that were left empty", () => {
    const node = JSON.parse(
      profileToDocument({ ...profile, email: "", phone: "", website: "" }, WEB_ID),
    );
    expect(Object.keys(node)).not.toContain(SCHEMA_TERMS.email);
    expect(Object.keys(node)).not.toContain(SCHEMA_TERMS.telephone);
    expect(Object.keys(node)).not.toContain(SCHEMA_TERMS.url);
  });

  it("treats anything other than 'discoverable' as private", () => {
    expect(documentToProfile(
      JSON.stringify({ "@id": WEB_ID, [CFY_TERMS.visibility]: "discoverabel" }),
    ).discoverable).toBe(false);
    expect(documentToProfile(
      JSON.stringify({ "@id": WEB_ID, [CFY_TERMS.visibility]: "private" }),
    ).discoverable).toBe(false);
  });
});

describe("listing mapping", () => {
  it("maps offer to schema:Offer and demand to schema:Demand", () => {
    expect(JSON.parse(listingToDocument(listing))["@type"]).toBe(SCHEMA_TERMS.Offer);
    expect(JSON.parse(listingToDocument({ ...listing, kind: "demand" }))["@type"]).toBe(
      SCHEMA_TERMS.Demand,
    );
  });

  it("round-trips every field", () => {
    const back = documentToListing(listingToDocument(listing), listing.sourceUrl);
    expect(back).toEqual({
      ...listing,
      createdAt: "2026-02-01T01:00:00.000Z",
      updatedAt: "2026-03-01T02:00:00.000Z",
    });
  });

  it("derives the id from the resource filename", () => {
    expect(documentToListing(listingToDocument(listing), listing.sourceUrl).id).toBe(
      "kopi-gayo-abc123",
    );
  });

  it("writes a quantity node with unit rather than a bare string", () => {
    const node = JSON.parse(listingToDocument(listing));
    expect(node[SCHEMA_TERMS.quantitativeValue]).toEqual({
      "@type": SCHEMA_TERMS.QuantitativeValue,
      [SCHEMA_TERMS.value]: "500",
      [SCHEMA_TERMS.unitText]: "kg",
    });
  });

  it("keeps price out of the document when there is none", () => {
    const node = JSON.parse(listingToDocument({ ...listing, price: "" }));
    expect(Object.keys(node)).not.toContain(SCHEMA_TERMS.price);
    expect(Object.keys(node)).not.toContain(SCHEMA_TERMS.priceCurrency);
  });

  it("defaults currency to IDR when the document has none", () => {
    const raw = JSON.stringify({ "@id": listing.sourceUrl, [SCHEMA_TERMS.name]: "x" });
    expect(documentToListing(raw, listing.sourceUrl).currency).toBe("IDR");
  });

  it("falls back to kg for an unknown unit and offer for an unknown kind", () => {
    const raw = JSON.stringify({
      "@id": listing.sourceUrl,
      [SCHEMA_TERMS.quantitativeValue]: { [SCHEMA_TERMS.unitText]: "karung" },
      [CFY_TERMS.kind]: "barter",
    });
    const back = documentToListing(raw, listing.sourceUrl);
    expect(back.unit).toBe("kg");
    expect(back.kind).toBe("offer");
  });

  it("rejects a document with no subject", () => {
    expect(() => documentToListing("{}", listing.sourceUrl)).toThrow(/no @id/);
  });
});

describe("evidence mapping", () => {
  it("is a CreativeWork so no credential format is claimed", () => {
    expect(JSON.parse(evidenceToDocument(evidence))["@type"]).toBe(SCHEMA_TERMS.CreativeWork);
  });

  it("round-trips every field", () => {
    const back = documentToEvidence(evidenceToDocument(evidence), evidence.sourceUrl);
    expect(back).toEqual({
      ...evidence,
      notes: "",
      createdAt: "2026-03-01T02:00:00.000Z",
    });
  });

  it("omits cfy:references when nothing was shared", () => {
    const node = JSON.parse(evidenceToDocument({ ...evidence, sharedWith: [] }));
    expect(Object.keys(node)).not.toContain(CFY_TERMS.references);
  });

  it("drops blank entries from the share list instead of writing empty strings", () => {
    const node = JSON.parse(
      evidenceToDocument({ ...evidence, sharedWith: [WEB_ID, "  ", ""] }),
    );
    expect(node[CFY_TERMS.references]).toEqual([WEB_ID]);
  });

  it("expands a single @id reference back into the share list", () => {
    const raw = JSON.stringify({
      "@id": evidence.sourceUrl,
      [CFY_TERMS.references]: { "@id": WEB_ID },
    });
    expect(documentToEvidence(raw, evidence.sourceUrl).sharedWith).toEqual([WEB_ID]);
  });
});

describe("RFQ mapping", () => {
  it("omits the delivery block when nothing was delivered", () => {
    const node = JSON.parse(rfqToDocument(rfq));
    expect(Object.keys(node)).not.toContain(CFY_TERMS.delivery);
    expect(documentToRfq(rfqToDocument(rfq), rfq.sourceUrl, "buyer").deliveries).toEqual([]);
  });

  it("round-trips a delivery record including the failure detail", () => {
    const delivered: RfqThread = {
      ...rfq,
      deliveries: [
        { at: "2026-03-02T09:00:00+07:00", ok: true, target: "https://pod.example/bob/chainify/inbox/" },
        { at: "2026-03-03T09:00:00+07:00", ok: false, target: "https://pod.example/bob/chainify/inbox/", detail: "403 webid_forbidden" },
      ],
    };
    const back = documentToRfq(rfqToDocument(delivered), rfq.sourceUrl, "buyer");
    expect(back.deliveries).toEqual([
      { at: "2026-03-02T02:00:00.000Z", ok: true, target: "https://pod.example/bob/chainify/inbox/", detail: undefined },
      { at: "2026-03-03T02:00:00.000Z", ok: false, target: "https://pod.example/bob/chainify/inbox/", detail: "403 webid_forbidden" },
    ]);
  });

  it("reads a boolean deliveryOk written by another writer", () => {
    const raw = JSON.stringify({
      "@id": rfq.sourceUrl,
      [CFY_TERMS.delivery]: [{ [CFY_TERMS.deliveryOk]: true, [CFY_TERMS.deliveryTarget]: "https://pod.example/bob/" }],
    });
    expect(documentToRfq(raw, rfq.sourceUrl, "seller").deliveries[0].ok).toBe(true);
  });

  it("ignores a malformed delivery block rather than throwing", () => {
    const raw = JSON.stringify({ "@id": rfq.sourceUrl, [CFY_TERMS.delivery]: "sudah dikirim" });
    expect(documentToRfq(raw, rfq.sourceUrl, "buyer").deliveries).toEqual([]);
  });

  it("falls back to draft for an unknown status", () => {
    const raw = JSON.stringify({ "@id": rfq.sourceUrl, [CFY_TERMS.status]: "diproses" });
    expect(documentToRfq(raw, rfq.sourceUrl, "buyer").status).toBe("draft");
  });

  it("takes the role from the caller, since the same document lives in both Pods", () => {
    const raw = rfqToDocument(rfq);
    expect(documentToRfq(raw, rfq.sourceUrl, "buyer").role).toBe("buyer");
    expect(documentToRfq(raw, rfq.sourceUrl, "seller").role).toBe("seller");
  });
});

describe("public index", () => {
  const index: PublicIndex = {
    webId: WEB_ID,
    displayName: "Koperasi Tani Gayo",
    publishedAt: "2026-03-01T03:00:00.000Z",
    entries: [
      {
        url: "https://pod.example/alice/chainify/profile/business-profile.jsonld",
        title: "Koperasi Tani Gayo",
        kind: "profile",
        category: "Pengolahan kopi",
        location: "Aceh Tengah",
      },
      {
        url: listing.sourceUrl,
        title: listing.title,
        kind: "listing",
        category: listing.category,
        location: listing.location,
        quantity: "500",
        unit: "kg",
      },
    ],
  };

  it("round-trips the entries it was given", () => {
    const back = documentToPublicIndex(publicIndexToDocument(index));
    expect(back).toEqual({ ...index, publishedAt: "2026-03-01T03:00:00.000Z" });
  });

  it("carries no price and no contact detail", () => {
    const text = publicIndexToDocument(index);
    for (const term of [
      SCHEMA_TERMS.price,
      SCHEMA_TERMS.priceCurrency,
      SCHEMA_TERMS.email,
      SCHEMA_TERMS.telephone,
    ]) {
      expect(text).not.toContain(term);
    }
  });

  it("subjects the index on the WebID fragment so it never collides with the card", () => {
    expect(JSON.parse(publicIndexToDocument(index))["@id"]).toBe(`${WEB_ID}#index`);
  });

  it("omits the quantity node for an entry without a quantity", () => {
    const node = JSON.parse(publicIndexToDocument(index));
    const profileEntry = node[CFY_TERMS.item][0];
    expect(Object.keys(profileEntry)).not.toContain(SCHEMA_TERMS.quantitativeValue);
  });

  it("defaults an unknown entry kind to profile rather than dropping the entry", () => {
    const raw = JSON.stringify({
      "@id": `${WEB_ID}#index`,
      [CFY_TERMS.item]: [{ "@id": "https://pod.example/x", [CFY_TERMS.kind]: "layanan" }],
    });
    const back = documentToPublicIndex(raw);
    expect(back.entries).toHaveLength(1);
    expect(back.entries[0].kind).toBe("profile");
  });

  it("ignores a non-array item list instead of crashing", () => {
    const raw = JSON.stringify({ "@id": `${WEB_ID}#index`, [CFY_TERMS.item]: "https://pod.example/x" });
    expect(documentToPublicIndex(raw).entries).toEqual([]);
  });
});
