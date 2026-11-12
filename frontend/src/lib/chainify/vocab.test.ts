import { describe, expect, it } from "vitest";
import {
  LISTING_UNITS,
  POD_CONTAINERS,
  podPaths,
  slugify,
  uniqueSlug,
} from "./vocab";

describe("podPaths", () => {
  const paths = podPaths("https://pod.example/alice");

  it("keeps a trailing slash on the storage root", () => {
    expect(paths.root).toBe("https://pod.example/alice/");
  });

  it("does not double a trailing slash that was already there", () => {
    expect(podPaths("https://pod.example/alice/").root).toBe("https://pod.example/alice/");
    expect(podPaths("https://pod.example/alice//").root).toBe("https://pod.example/alice/");
  });

  it("puts the public index inside the public container so its ACL can differ", () => {
    expect(paths.publicIndex).toBe(`${paths.publicDir}index.jsonld`);
    expect(paths.publicIndex.startsWith(paths.chainify)).toBe(true);
  });

  it("writes the profile as one document rather than a container", () => {
    expect(paths.profile).toBe(
      "https://pod.example/alice/chainify/profile/business-profile.jsonld",
    );
  });

  it("ends every container path with a slash", () => {
    for (const container of [paths.listings, paths.requirements, paths.evidence, paths.rfq, paths.inbox, paths.publicDir]) {
      expect(container.endsWith("/")).toBe(true);
      expect(container.startsWith(paths.chainify)).toBe(true);
    }
  });
});

describe("POD_CONTAINERS", () => {
  it("creates the chainify container before any child", () => {
    expect(POD_CONTAINERS[0]).toBe("chainify");
  });

  it("creates the public container last so an ACL change cannot orphan a write", () => {
    expect(POD_CONTAINERS[POD_CONTAINERS.length - 1]).toBe("publicDir");
  });

  it("resolves to a real path for every key", () => {
    const paths = podPaths("https://pod.example/alice");
    for (const key of POD_CONTAINERS) {
      expect(paths[key]).toMatch(/^https:\/\/pod\.example\/alice\/chainify\//);
    }
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Green Bean Gayo", "listing")).toBe("green-bean-gayo");
  });

  it("strips accents so the slug stays ASCII", () => {
    expect(slugify("Café Gayo", "listing")).toBe("cafe-gayo");
  });

  it("collapses runs of punctuation into one hyphen", () => {
    expect(slugify("Kopi --- 50% / kg", "listing")).toBe("kopi-50-kg");
  });

  it("does not leave leading or trailing hyphens", () => {
    expect(slugify("--- kopi ---", "listing")).toBe("kopi");
  });

  it("falls back when nothing survives", () => {
    expect(slugify("   ", "listing")).toBe("listing");
    expect(slugify("☕☕", "listing")).toBe("listing");
  });

  it("caps the length so the filename stays predictable", () => {
    const slug = slugify("a".repeat(120), "listing");
    expect(slug).toHaveLength(48);
  });
});

describe("uniqueSlug", () => {
  it("appends a suffix after the slug", () => {
    expect(uniqueSlug("Green Bean Gayo", "listing")).toMatch(/^green-bean-gayo-[a-z0-9]{1,6}$/);
  });

  it("keeps the fallback when the title slugs to nothing", () => {
    expect(uniqueSlug("☕", "listing")).toMatch(/^listing-[a-z0-9]{1,6}$/);
  });

  it("does not collide across a thousand calls of the same title", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(uniqueSlug("Kopi", "listing"));
    expect(seen.size).toBeGreaterThan(990);
  });
});

describe("LISTING_UNITS", () => {
  it("matches the union the mapper accepts", () => {
    expect([...LISTING_UNITS]).toEqual(["kg", "ton", "liter", "pcs", "unit", "batch"]);
  });
});
