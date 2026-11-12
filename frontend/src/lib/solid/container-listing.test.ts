/**
 * The container-listing reader is the load-bearing piece of every Pod list page: if it
 * silently returns nothing, the app shows an empty workspace while the Pod is full and
 * nothing anywhere reports an error. Both URL shapes a Solid provider may emit are
 * pinned here, with the real Turtle that Community Solid Server returns.
 */

import { describe, expect, it } from "vitest";
import { extractChildUrlsForTest as extractChildUrls } from "./resources";

const CONTAINER = "https://pod.example/alice/chainify/listings/";

describe("extractChildUrls", () => {
  it("reads absolute container members", () => {
    const body = `
      <> a ldp:Container .
      <> ldp:contains <${CONTAINER}a.jsonld> .
      <> ldp:contains <${CONTAINER}b.jsonld> .
    `;
    expect(extractChildUrls(body, CONTAINER)).toEqual([
      `${CONTAINER}a.jsonld`,
      `${CONTAINER}b.jsonld`,
    ]);
  });

  it("reads relative container members, which is what CSS emits", () => {
    const body = `@prefix dc: <http://purl.org/dc/terms/>.
@prefix ldp: <http://www.w3.org/ns/ldp#>.
@prefix posix: <http://www.w3.org/ns/posix/stat#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<> a ldp:Container, ldp:BasicContainer, ldp:Resource;
    dc:modified "2026-11-12T00:55:57.758Z"^^xsd:dateTime;
    posix:mtime 1794444957;
    ldp:contains <uji-kopi-arabika.jsonld>.
<uji-kopi-arabika.jsonld> a ldp:Resource, <http://www.w3.org/ns/iana/media-types/application/ld+json#Resource>;
    posix:size 677.
`;
    expect(extractChildUrls(body, CONTAINER)).toEqual([
      `${CONTAINER}uji-kopi-arabika.jsonld`,
    ]);
  });

  it("merges both shapes without duplicating a member", () => {
    const body = `
      ldp:contains <a.jsonld>, <${CONTAINER}a.jsonld> .
    `;
    expect(extractChildUrls(body, CONTAINER)).toEqual([`${CONTAINER}a.jsonld`]);
  });

  it("skips nested resources so a child container is not read as a document", () => {
    const body = `
      ldp:contains <nested/deep.jsonld> .
      ldp:contains <${CONTAINER}nested/deep.jsonld> .
      ldp:contains <top.jsonld> .
    `;
    expect(extractChildUrls(body, CONTAINER)).toEqual([`${CONTAINER}top.jsonld`]);
  });

  it("ignores the container itself and foreign origins", () => {
    const body = `
      ldp:contains <${CONTAINER}> .
      ldp:contains <https://elsewhere.example/x.jsonld> .
      ldp:contains <self.jsonld> .
    `;
    expect(extractChildUrls(body, CONTAINER)).toEqual([`${CONTAINER}self.jsonld`]);
  });

  it("does not mistake prefixed names or datatype IRIs for members", () => {
    const body = `
      @prefix ldp: <http://www.w3.org/ns/ldp#>.
      <> ldp:contains <ok.jsonld>;
         dc:modified "2026-11-12T00:00:00Z"^^xsd:dateTime.
    `;
    expect(extractChildUrls(body, CONTAINER)).toEqual([`${CONTAINER}ok.jsonld`]);
  });

  it("returns nothing for an empty listing", () => {
    expect(extractChildUrls("<> a ldp:Container .\n", CONTAINER)).toEqual([]);
  });

  it("keeps a member whose name ends in a digit", () => {
    const body = `ldp:contains <beras-25> .`;
    expect(extractChildUrls(body, CONTAINER)).toEqual([`${CONTAINER}beras-25`]);
  });
});
