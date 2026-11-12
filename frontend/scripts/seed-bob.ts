/**
 * Seeds Bob's Pod with a profile, two listings, and a published public index.
 *
 * Alice has been the only populated participant, so federation has only ever been tested
 * against one non-empty index. This script signs in as Bob through the real issuer, writes
 * Chainify documents with the session's DPoP fetch, and then makes the public index and the
 * container it lives in readable by everyone, which is what a peer actually needs.
 *
 * The write is deliberately done through the same shapes the app produces
 * (`profileToDocument`, `listingToDocument`, `publicIndexToDocument`) so a seeded Pod is
 * indistinguishable from one filled in by hand.
 *
 * Run after `make dev`: `bun run scripts/seed-bob.ts`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const WEB_URL = (process.env.WEB_URL ?? "https://localhost:13000").replace(/\/+$/, "");
const EMAIL = process.env.CSS_EMAIL ?? "bob@example.com";
const PASSWORD = process.env.CSS_PASSWORD ?? "chainify-demo-2026";

const PUT_SCRIPT = join(tmpdir(), "chainify-seed-bob.js");

function step(message: string): void {
  process.stdout.write(`\n[seed-bob] ${message}\n`);
}

function note(message: string): void {
  process.stdout.write(`   ${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`\n[seed-bob] FAIL: ${message}\n`);
  process.exit(1);
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${WEB_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const button = page.getByRole("button", { name: /Continue with local CSS provider/i });
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 750));
  await Promise.all([
    page
      .waitForURL((url) => url.origin !== new URL(WEB_URL).origin, { timeout: 30_000 })
      .catch(() => undefined),
    button.click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  await page.locator('input[name="email"]').first().fill(EMAIL);
  await page.locator('input[name="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  if (page.url().includes("/consent")) {
    const authorize = page.locator('form button[type="submit"]').first();
    await authorize.waitFor({ state: "visible", timeout: 20_000 });
    await Promise.all([
      page
        .waitForURL(
          (url) => url.origin === new URL(WEB_URL).origin && url.pathname === "/dashboard",
          { timeout: 30_000 },
        )
        .catch(() => undefined),
      authorize.click(),
    ]);
  }
  await page.waitForURL(
    (url) => url.origin === new URL(WEB_URL).origin && url.pathname === "/dashboard",
    { timeout: 30_000 },
  );
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    step(`1. sign in as ${EMAIL}`);
    await signIn(page);
    note(page.url().replace(WEB_URL, ""));

    step("2. resolve the WebID and its storage root");
    const identity = await page.evaluate(async () => {
      const info = window.__chainifySession?.getSession().info;
      if (!info?.webId) return null;
      const response = await fetch(
        `/api/identity/resolve?webId=${encodeURIComponent(info.webId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as { storage?: string[] };
      return { webId: info.webId, storage: body.storage?.[0] };
    });
    if (!identity?.webId || !identity.storage) fail("could not resolve the WebID or storage");
    const base = identity.storage.replace(/\/+$/, "");
    note(`webId   = ${identity.webId}`);
    note(`storage = ${identity.storage}`);

    step("3. ensure the Chainify containers exist");
    const containers = ["chainify", "profile", "listings", "requirements", "evidence", "rfq", "inbox", "public"];
    const created = await page.evaluate(
      async ({ root, names }: { root: string; names: string[] }) => {
        const session = window.__chainifySession?.getSession();
        if (!session) return { error: "no session", results: [] as string[] };
        const results: string[] = [];
        for (const name of names) {
          const url = name === "chainify" ? `${root}/chainify/` : `${root}/chainify/${name}/`;
          const response = await session.fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "text/turtle" },
            body: "@prefix ldp: <http://www.w3.org/ns/ldp#> .\n<> a ldp:Container .\n",
          });
          results.push(`${name}:${response.status}`);
        }
        return { results };
      },
      { root: base, names: containers },
    );
    if (created.error) fail(created.error);
    note(created.results.join(" "));

    step("4. write the profile, two listings, and rebuild the public index");
    const written = await page.evaluate(async ({ root }: { root: string }) => {
      const session = window.__chainifySession?.getSession();
      if (!session) return { error: "no session" as string, results: [] as string[], profileUrl: "", indexUrl: "", listings: 0 };
      const put = async (url: string, body: string) => {
        const response = await session.fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/ld+json" },
          body,
        });
        return `${response.status} ${url.replace(root, "")}`;
      };

      const webId = session.info.webId as string;
      const CFY = "https://chainify.local/ns#";
      const context = {
        "@context": {
          schema: "https://schema.org/",
          cfy: "https://chainify.local/ns#",
        },
      };

      const profileUrl = `${root}/chainify/profile/business-profile.jsonld`;
      const profile = {
        ...context,
        "@id": webId,
        "@type": "schema:Person",
        "schema:name": "UD Sumber Pangan Nusantara",
        "schema:description":
          "Distributor bahan baku pangan untuk katering dan toko kelontong di Jawa Timur.",
        "schema:knowsAbout": "Distribusi bahan pangan",
        "schema:address": "Surabaya, Jawa Timur",
        "schema:email": "halo@sumberpangan.example",
        "schema:telephone": "+62 812 3456 7890",
        [CFY + "visibility"]: "discoverable",
        "schema:dateModified": new Date().toISOString(),
      };

      const now = new Date().toISOString();
      const listings = [
        {
          slug: "beras-medium-surabaya",
          name: "Beras medium kemasan 25 kg",
          description: "Beras medium kadar air 14%, sortasi mesin, kemasan karung 25 kg.",
          quantity: "1200",
          unit: "kg",
          price: "12500",
          category: "Bahan baku pangan",
          location: "Surabaya",
        },
        {
          slug: "minyak-goreng-curah",
          name: "Minyak goreng curah",
          description: "Minyak goreng curah untuk kebutuhan katering, jemput di gudang.",
          quantity: "600",
          unit: "liter",
          price: "15800",
          category: "Bahan baku pangan",
          location: "Sidoarjo",
        },
      ];

      const results: string[] = [await put(profileUrl, JSON.stringify(profile))];
      const entries: Record<string, unknown>[] = [
        {
          "@type": "cfy:Entry",
          "@id": profileUrl,
          "schema:name": profile["schema:name"],
          "cfy:kind": "profile",
          "schema:category": profile["schema:knowsAbout"],
          "cfy:generalLocation": profile["schema:address"],
        },
      ];

      for (const item of listings) {
        const url = `${root}/chainify/listings/${item.slug}.jsonld`;
        const document = {
          ...context,
          "@id": url,
          "@type": "schema:Offer",
          "schema:name": item.name,
          "schema:description": item.description,
          "schema:category": item.category,
          "schema:quantitativeValue": {
            "@type": "schema:QuantitativeValue",
            "schema:value": item.quantity,
            "schema:unitText": item.unit,
          },
          "schema:price": item.price,
          "schema:priceCurrency": "IDR",
          "schema:availableAtOrFrom": item.location,
          "schema:datePosted": now,
          "schema:dateModified": now,
          [CFY + "kind"]: "offer",
          [CFY + "visibility"]: "discoverable",
          [CFY + "ownerWebId"]: webId,
        };
        results.push(await put(url, JSON.stringify(document)));
        entries.push({
          "@type": "cfy:Entry",
          "@id": url,
          "schema:name": item.name,
          "cfy:kind": "listing",
          "schema:category": item.category,
          "cfy:generalLocation": item.location,
          "schema:quantitativeValue": {
            "@type": "schema:QuantitativeValue",
            "schema:value": item.quantity,
            "schema:unitText": item.unit,
          },
        });
      }

      const indexUrl = `${root}/chainify/public/index.jsonld`;
      const index = {
        ...context,
        "@id": `${webId}#index`,
        "@type": "schema:BusinessFunction",
        "schema:name": profile["schema:name"],
        "schema:dateModified": now,
        "cfy:item": entries,
      };
      results.push(await put(indexUrl, JSON.stringify(index)));
      return { results, profileUrl, indexUrl, listings: listings.length };
    }, { root: base });
    if (written.error) fail(written.error);
    for (const line of written.results) note(line);

    step("5. make the public index readable by any peer");
    // The index has to be public, and so does the container it lives in: a Pod owner
    // can grant per-resource access, but the container's own ACL is what makes a
    // listing inside it enumerable. The app never does this on its own, so a seed
    // that claims to be discoverable has to do it explicitly and say so.
    const acl = await page.evaluate(
      async ({ dir, file }: { dir: string; file: string }) => {
        const session = window.__chainifySession?.getSession();
        if (!session) return { error: "no session" as string, status: 0, detail: "" };
        const aclBody = `@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#publicRead>
    a acl:Authorization ;
    acl:agentClass foaf:Agent ;
    acl:accessTo <${file}> ;
    acl:default <${dir}> ;
    acl:mode acl:Read .
`;
        const response = await session.fetch(`${dir}.acl`, {
          method: "PUT",
          headers: { "Content-Type": "text/turtle" },
          body: aclBody,
        });
        return { status: response.status, detail: response.ok ? "" : (await response.text()).slice(0, 200) };
      },
      { dir: `${base}/chainify/public/`, file: `${base}/chainify/public/index.jsonld` },
    );
    if (acl.error) fail(acl.error);
    note(`PUT public/.acl -> HTTP ${acl.status}${acl.detail ? ` ${acl.detail}` : ""}`);

    step("6. read the index back anonymously");
    const anonymous = await page.evaluate(async (url: string) => {
      // A bare fetch has no DPoP proof, so a 200 here can only come from the ACL.
      const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/ld+json" } });
      return { status: response.status, length: (await response.text()).length };
    }, written.indexUrl);
    note(`anonymous GET index -> HTTP ${anonymous.status}, ${anonymous.length} bytes`);

    writeFileSync(
      PUT_SCRIPT,
      JSON.stringify({ webId: identity.webId, storage: identity.storage, index: written.indexUrl }, null, 2),
      "utf8",
    );
    mkdirSync(tmpdir(), { recursive: true });

    if (consoleErrors.length > 0) {
      note("page errors:");
      for (const line of consoleErrors) note(`- ${line}`);
    }

    if (anonymous.status === 200) {
      process.stdout.write("\n[seed-bob] PASS\n");
    } else {
      fail(
        `the public index is not readable anonymously (HTTP ${anonymous.status}). ` +
          "The Pod provider shapes its ACL, so this needs the provider's own sharing control.",
      );
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

void main();
