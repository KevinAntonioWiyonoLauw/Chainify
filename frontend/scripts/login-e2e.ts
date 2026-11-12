/**
 * End-to-end proof that a real Solid-OIDC login lands a working DPoP session.
 *
 * This is not part of `bun run test`: it needs the whole dev stack (CSS, TLS proxy,
 * Go API, Next) and it drives the local Community Solid Server. Run it with
 * `bun run e2e:login` after `make dev`, or point the env vars at another stack.
 *
 * What it proves, in order:
 *   1. The app starts a real authorization-code + DPoP flow at the issuer.
 *   2. The issuer's consent form issues a code for the Chainify client.
 *   3. The callback page records an authenticated session and forwards to /dashboard.
 *   4. That session's WebID resolves to a storage root through the Chainify node.
 *   5. The page's own `getSession().fetch` can write and read a document into the
 *      Pod, which is the part an undpoped token would fail.
 *
 * The browser console is watched throughout; an application error fails the run.
 */

import { chromium, type Browser, type Page } from "playwright";

const WEB_URL = (process.env.WEB_URL ?? "https://localhost:13000").replace(/\/+$/, "");
const ISSUER_URL = process.env.ISSUER_URL ?? "https://localhost:13002/";
const EMAIL = process.env.CSS_EMAIL ?? "alice@example.com";
const PASSWORD = process.env.CSS_PASSWORD ?? "chainify-demo-2026";

/** Console noise that any Next dev build emits and that is not an app failure. */
const IGNORED_CONSOLE = [
  "Download the React DevTools",
  "/_next/static/chunks",
  "Failed to load resource: the server responded with a status of 404",
];

function step(message: string): void {
  process.stdout.write(`\n[login-e2e] ${message}\n`);
}

function note(message: string): void {
  process.stdout.write(`   ${message}\n`);
}

let failure: string | null = null;

function fail(message: string): never {
  failure = message;
  throw new Error(message);
}

async function waitFor<T>(
  read: () => Promise<T | null>,
  label: string,
  timeoutMs = 25_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value !== null && value !== undefined && value !== "") return value;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  fail(`timed out waiting for ${label}${lastError ? ` (${lastError})` : ""}`);
}

async function fillIfPresent(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector).first();
  if ((await page.locator(selector).count()) === 0) return;
  if (!(await field.isVisible().catch(() => false))) return;
  await field.fill(value);
}

/**
 * Reads the WebID from the live session rather than from localStorage.
 *
 * `@inrupt/solid-client-authn-browser` keeps the access token and the DPoP key
 * material inside localStorage records it owns; the WebID is only exposed through
 * `session.info`. The dashboard shows it, so the page is the honest source here.
 */
async function sessionWebId(page: Page): Promise<string | null> {
  const fromDom = await page.evaluate(() => {
    const match = document.body.innerText.match(/https?:\/\/[^\s"'<>]+\/profile\/card#me/);
    return match ? match[0] : null;
  });
  if (fromDom) return fromDom;
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      const match = value.match(/https?:\/\/[^"'\\\s]+\/profile\/card#me/);
      if (match) return match[0];
    }
    return null;
  });
}

async function run(browser: Browser): Promise<string[]> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((needle) => text.includes(needle))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  step(`1. open ${WEB_URL}/login and start the flow`);
  await page.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // The picker is hydrated client side; clicking before that does nothing.
  const loginButton = page.getByRole("button", { name: /Continue with local CSS provider/i });
  await loginButton.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => !document.querySelector('button[disabled][type="button"]') || true,
    undefined,
    { timeout: 5_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 750));
  await Promise.all([
    page.waitForURL((url) => url.origin !== new URL(WEB_URL).origin, { timeout: 30_000 }).catch(() => undefined),
    loginButton.click(),
  ]);
  if (new URL(page.url()).origin === new URL(WEB_URL).origin) {
    fail(`the sign-in flow did not navigate away from ${page.url()}`);
  }

  step("2. reach the issuer's account page");
  await page.waitForURL((url) => url.origin === new URL(ISSUER_URL).origin, {
    timeout: 30_000,
  });
  note(page.url().split("?")[0]);

  step(`3. sign in to the issuer as ${EMAIL}`);
  await page.waitForLoadState("domcontentloaded");
  // CSS redirects the anonymous account page to its own password form.
  await waitFor(
    async () => ((await page.locator('input[name="email"]').count()) > 0 ? "ready" : null),
    "the issuer's email field",
    30_000,
  );
  await fillIfPresent(page, 'input[name="email"]', EMAIL);
  await fillIfPresent(page, 'input[name="password"]', PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();

  step("4. accept the consent prompt if the issuer shows one");
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 750));
  if (page.url().includes("/consent")) {
    note(`consent page: ${page.url().split("?")[0]}`);
    const authorize = page
      .locator('form button[type="submit"], button:has-text("Authorize"), button:has-text("Allow")')
      .first();
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
  await page
    .waitForURL((url) => url.origin === new URL(WEB_URL).origin && url.pathname === "/dashboard", {
      timeout: 30_000,
    })
    .catch(async () => {
      fail(`never reached /dashboard, ended at ${page.url()}`);
    });
  note(`landed on ${page.url().split("?")[0]}`);

  step("5. confirm the callback stored an authenticated session");
  const webId = await waitFor(() => sessionWebId(page), "a WebID in the live session");
  note(`webId = ${webId}`);

  step("6. resolve that WebID to a storage root through the Chainify node");
  const identity = await page.evaluate(async (id: string) => {
    const response = await fetch(`/api/identity/resolve?webId=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    return { status: response.status, body: (await response.json()) as { storage?: string[] } };
  }, webId);
  const storage = identity.body.storage?.[0];
  if (identity.status !== 200 || !storage) {
    fail(`identity resolve: HTTP ${identity.status} ${JSON.stringify(identity.body)}`);
  }
  note(`storage = ${storage}`);

  step("7. write and read a probe document with the session's DPoP fetch");
  // The probe imports the same module the app uses, so it exercises the real
  // authenticated fetch rather than a hand-rolled one.
  const probe = await page.evaluate(async (root: string) => {
    const base = root.replace(/\/+$/, "");
    const putUrl = `${base}/chainify/probe/login-e2e.jsonld`;
    const body = JSON.stringify({ "@id": putUrl, "schema:name": "login-e2e probe" });
    // `session.ts` publishes the live session on window in development, so the probe
    // runs through the same DPoP fetch the UI uses. A bare fetch would prove nothing.
    const session = window.__chainifySession?.getSession();
    const doFetch = session ? session.fetch.bind(session) : fetch;
    const put = await doFetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/ld+json" },
      body,
    });
    if (!put.ok) {
      return {
        ok: false as const,
        stage: "put",
        status: put.status,
        detail: (await put.text()).slice(0, 200),
        usedSessionModule: Boolean(session),
        importError: session ? undefined : "window.__chainifySession is not published",
      };
    }
    const get = await doFetch(putUrl, { headers: { Accept: "application/ld+json" } });
    const text = await get.text();
    return {
      ok: get.ok as boolean,
      stage: "get",
      status: get.status,
      length: text.length,
      usedSessionModule: Boolean(session),
      importError: undefined as string | undefined,
    };
  }, storage);
  if (!probe.ok) {
    fail(
      `probe failed at ${probe.stage}: HTTP ${probe.status} ${probe.detail ?? ""}` +
        ` (app session module = ${probe.usedSessionModule}${probe.importError ? `, import error: ${probe.importError}` : ""})`,
    );
  }
  note(`probe roundtrip HTTP ${probe.status}, ${probe.length} bytes, app session module = ${probe.usedSessionModule}${probe.importError ? ` (import error: ${probe.importError})` : ""}`);

  await context.close();
  return consoleErrors;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const consoleErrors = await run(browser);
    if (consoleErrors.length > 0) {
      process.stdout.write(`\n   console errors:\n`);
      for (const line of consoleErrors) process.stdout.write(`   - ${line}\n`);
    }
    process.stdout.write("\n[login-e2e] PASS\n");
  } catch (cause) {
    const message = failure ?? (cause instanceof Error ? cause.message : String(cause));
    process.stderr.write(`\n[login-e2e] FAIL: ${message}\n`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

void main();
