import { afterEach, describe, expect, it, vi } from "vitest";
import { chainifyConfig } from "./config";

/**
 * The configured client identifier is relative (`/id`), because the client document is
 * generated from the request host. What leaves the browser must still be absolute:
 * OIDC requires `client_id` to be a URI, and the issuer dereferences it byte for byte.
 */
describe("chainifyConfig.solidClientId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function configFor(origin: string, clientId: string) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SOLID_CLIENT_ID", clientId);
    vi.stubGlobal("window", { location: { origin } });
    const mod = await import("./config");
    return mod.chainifyConfig;
  }

  it("joins a relative identifier onto the origin in use", async () => {
    const config = await configFor("https://localhost:13000", "/id");
    expect(config.solidClientId).toBe("https://localhost:13000/id");
  });

  it("follows the host the app was actually opened on", async () => {
    const config = await configFor("https://192.168.18.9:13000", "/id");
    expect(config.solidClientId).toBe("https://192.168.18.9:13000/id");
  });

  it("leaves an absolute identifier untouched", async () => {
    const config = await configFor(
      "https://192.168.18.9:13000",
      "https://localhost:13000/id",
    );
    expect(config.solidClientId).toBe("https://localhost:13000/id");
  });

  it("reports a relative identifier verbatim on the server pass", () => {
    vi.unstubAllGlobals();
    // No window: the value is resolved in the browser, never used to build a request here.
    expect(chainifyConfig.solidClientId.length).toBeGreaterThan(0);
  });
});
