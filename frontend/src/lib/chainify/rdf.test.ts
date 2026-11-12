import { describe, expect, it } from "vitest";
import {
  MalformedDocumentError,
  asNode,
  parseDocument,
  readQuantity,
  readString,
  readStrings,
  safeTimestamp,
  serializeDocument,
  withoutFragment,
  type JsonLdNode,
} from "./rdf";

describe("serializeDocument", () => {
  it("puts @context first so a reader sees the prefixes before any term", () => {
    const node: JsonLdNode = {
      "schema:name": "Koperasi Tani",
      "@id": "https://pod.example/profile/card#me",
      "@context": { schema: "https://schema.org/" },
    };
    const text = serializeDocument(node);
    expect(text.indexOf("@context")).toBeLessThan(text.indexOf("@id"));
  });

  it("drops undefined values instead of writing them as null", () => {
    const text = serializeDocument({ "@id": "x", "schema:name": undefined });
    expect(text).not.toContain("null");
    expect(JSON.parse(text)).toEqual({ "@id": "x" });
  });

  it("ends with a newline so a diff of the document stays readable", () => {
    expect(serializeDocument({ "@id": "x" }).endsWith("\n")).toBe(true);
  });
});

describe("parseDocument", () => {
  it("rejects text that is not JSON", () => {
    expect(() => parseDocument("<> a <x> .")).toThrow(MalformedDocumentError);
  });

  it("rejects a JSON array, which has no subject", () => {
    expect(() => parseDocument("[1, 2]")).toThrow(MalformedDocumentError);
  });

  it("rejects a node with no @id rather than inventing a subject", () => {
    expect(() => parseDocument('{"schema:name":"x"}')).toThrow(
      /no @id/,
    );
  });

  it("rejects a document whose subject does not match where it was fetched", () => {
    expect(() =>
      parseDocument('{"@id":"https://a"}', "https://b"),
    ).toThrow(/claims to describe/);
  });

  it("accepts a matching subject and keeps the raw text", () => {
    const raw = '{"@id":"https://a","schema:name":"x"}';
    const parsed = parseDocument(raw, "https://a");
    expect(parsed.id).toBe("https://a");
    expect(parsed.raw).toBe(raw);
  });
});

describe("readString", () => {
  const node: JsonLdNode = {
    "schema:name": "Gayo",
    "schema:price": 85000,
    "schema:flag": false,
    "schema:id": { "@id": "https://ref" },
    "schema:value": { "@value": "nested" },
    "schema:list": ["first", "second"],
  };

  it("reads a plain string", () => {
    expect(readString(node, "schema:name")).toBe("Gayo");
  });

  it("stringifies numbers and booleans", () => {
    expect(readString(node, "schema:price")).toBe("85000");
    expect(readString(node, "schema:flag")).toBe("false");
  });

  it("follows an @id reference", () => {
    expect(readString(node, "schema:id")).toBe("https://ref");
  });

  it("unwraps an @value node", () => {
    expect(readString(node, "schema:value")).toBe("nested");
  });

  it("takes the first entry of an array", () => {
    expect(readString(node, "schema:list")).toBe("first");
  });

  it("returns an empty string for a missing property", () => {
    expect(readString(node, "schema:absent")).toBe("");
  });
});

describe("readStrings", () => {
  it("flattens an array of strings and @id nodes", () => {
    const node: JsonLdNode = {
      "cfy:references": ["https://a", { "@id": "https://b" }],
    };
    expect(readStrings(node, "cfy:references")).toEqual(["https://a", "https://b"]);
  });

  it("returns one entry for a scalar value", () => {
    expect(readStrings({ "schema:name": "x" }, "schema:name")).toEqual(["x"]);
  });

  it("returns an empty list when the property is absent", () => {
    expect(readStrings({}, "cfy:references")).toEqual([]);
  });
});

describe("readQuantity", () => {
  it("reads value and unit from a schema:QuantitativeValue node", () => {
    const node: JsonLdNode = {
      "schema:quantitativeValue": {
        "@type": "schema:QuantitativeValue",
        "schema:value": "500",
        "schema:unitText": "kg",
      },
    };
    expect(readQuantity(node, "schema:quantitativeValue")).toEqual({
      value: "500",
      unit: "kg",
    });
  });

  it("takes the first node when the value is an array", () => {
    const node: JsonLdNode = {
      "schema:quantitativeValue": [
        { "schema:value": "1", "schema:unitText": "ton" },
        { "schema:value": "2" },
      ],
    };
    expect(readQuantity(node, "schema:quantitativeValue").value).toBe("1");
  });

  it("returns empties rather than throwing on a malformed node", () => {
    expect(readQuantity({ "schema:quantitativeValue": "500 kg" }, "schema:quantitativeValue"))
      .toEqual({ value: "", unit: "" });
  });
});

describe("asNode", () => {
  it("narrows an object", () => {
    expect(asNode({ "@id": "x" })).toEqual({ "@id": "x" });
  });

  it("refuses arrays, null, and scalars", () => {
    expect(asNode([])).toBeNull();
    expect(asNode(null)).toBeNull();
    expect(asNode("x")).toBeNull();
    expect(asNode(undefined)).toBeNull();
  });
});

describe("withoutFragment", () => {
  it("strips the fragment", () => {
    expect(withoutFragment("https://pod/card#me")).toBe("https://pod/card");
  });

  it("leaves a URL without a fragment alone", () => {
    expect(withoutFragment("https://pod/card")).toBe("https://pod/card");
  });
});

describe("safeTimestamp", () => {
  it("normalises a valid timestamp to ISO", () => {
    expect(safeTimestamp("2026-03-01T10:00:00+07:00")).toBe("2026-03-01T03:00:00.000Z");
  });

  it("returns the input unchanged when unparseable, instead of inventing a date", () => {
    expect(safeTimestamp("besok")).toBe("besok");
  });

  it("returns an empty string for empty input", () => {
    expect(safeTimestamp("")).toBe("");
  });
});
