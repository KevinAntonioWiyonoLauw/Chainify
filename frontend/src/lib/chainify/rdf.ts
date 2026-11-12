/**
 * Tiny RDF document helpers for Chainify business resources.
 *
 * Chainify writes JSON-LD with a fixed, known shape (see `vocab.ts`). That means it
 * does not need a full JSON-LD processor: it needs to read the exact documents it
 * wrote, plus tolerate the obvious variations (single value vs array, `@id` objects
 * vs plain strings). Anything outside that shape is skipped rather than guessed at,
 * which keeps a malformed remote document from being silently interpreted as data.
 */

export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };

export interface JsonLdNode {
  "@id"?: string;
  "@type"?: string | string[];
  "@context"?: JsonLdValue;
  [key: string]: JsonLdValue | undefined;
}

/**
 * A nested node read back out of a document.
 *
 * The index signature on `JsonLdNode` lists `JsonLdValue` but not the node shape itself,
 * so a nested object is not assignable to `JsonLdNode` under structural typing even
 * though it is the same thing at runtime. Reading code narrows to this type instead of
 * fighting the writer type.
 */
export interface NestedNode {
  "@id"?: string;
  "@type"?: string | string[];
  [key: string]: JsonLdValue | undefined;
}

/** Narrows one `JsonLdValue` to a nested node, or null when it is not an object. */
export function asNode(value: JsonLdValue | undefined): NestedNode | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as NestedNode;
}

export interface ParsedDocument {
  /** The subject IRI of the resource document itself. */
  id: string;
  node: JsonLdNode;
  /** The raw text, kept so callers can show or copy what was actually stored. */
  raw: string;
}

export class MalformedDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedDocumentError";
  }
}

/** Serialises a message-shaped node into pretty JSON-LD text. */
export function serializeDocument(node: JsonLdNode): string {
  const ordered: JsonLdNode = {};
  if (node["@context"] !== undefined) ordered["@context"] = node["@context"];
  for (const [key, value] of Object.entries(node)) {
    if (key === "@context") continue;
    if (value === undefined) continue;
    ordered[key] = value;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Parses the JSON-LD Chainify itself writes, rejecting anything without an `@id`. */
export function parseDocument(raw: string, expectedId?: string): ParsedDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MalformedDocumentError("The resource is not valid JSON-LD.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new MalformedDocumentError("The resource is not a JSON-LD node.");
  }
  const node = parsed as JsonLdNode;
  const id = typeof node["@id"] === "string" ? node["@id"] : "";
  if (id === "") {
    throw new MalformedDocumentError(
      "The resource has no @id, so its subject cannot be determined.",
    );
  }
  if (expectedId && id !== expectedId) {
    throw new MalformedDocumentError(
      `The resource was fetched from ${expectedId} but claims to describe ${id}.`,
    );
  }
  return { id, node, raw };
}

/** Returns the first string value of a property, or "" when absent. */
export function readString(node: JsonLdNode, key: string): string {
  const value = node[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") return item;
      if (typeof item === "number" || typeof item === "boolean") return String(item);
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const nested = readString(item as JsonLdNode, "@value");
        if (nested) return nested;
      }
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nested = value as JsonLdNode;
    const byId = typeof nested["@id"] === "string" ? nested["@id"] : "";
    if (byId) return byId;
    return readString(nested, "@value");
  }
  return "";
}

/** Returns every string value of a property, flattening arrays and `@value` nodes. */
export function readStrings(node: JsonLdNode, key: string): string[] {
  const value = node[key];
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      const nested = item as JsonLdNode;
      const byId = typeof nested["@id"] === "string" ? nested["@id"] : "";
      if (byId) {
        out.push(byId);
        continue;
      }
      const literal = readString(nested, "@value");
      if (literal) out.push(literal);
    }
  }
  return out;
}

/** Reads the coarse numeric part of a `schema:QuantitativeValue` node. */
export function readQuantity(node: JsonLdNode, key: string): { value: string; unit: string } {
  const raw = node[key];
  const candidates = Array.isArray(raw) ? raw : [raw];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const nested = candidate as JsonLdNode;
    return {
      value: readString(nested, "schema:value") || readString(nested, "https://schema.org/value"),
      unit: readString(nested, "schema:unitText") || readString(nested, "https://schema.org/unitText"),
    };
  }
  return { value: "", unit: "" };
}

/** Strips a fragment so a resource URL can be compared with a document subject. */
export function withoutFragment(url: string): string {
  const index = url.indexOf("#");
  return index === -1 ? url : url.slice(0, index);
}

/** Human-readable ISO timestamp with a stable fallback for malformed input. */
export function safeTimestamp(value: string): string {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString();
}
