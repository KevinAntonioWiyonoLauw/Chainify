import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  /**
   * The dev server only trusts localhost by default. Testing the Solid-OIDC login
   * from a phone or another machine needs the host LAN origin, because the CSS
   * container must dereference the same client identifier the browser sends.
   */
  allowedDevOrigins: ["192.168.18.9", "localhost", "*.local"],
  /**
   * Browser calls reach the Go API through this origin instead of a second
   * http://host:13001 origin. Same-origin keeps the https page from issuing
   * mixed-content requests and removes the CORS preflight entirely, so the API
   * server needs no changes. The backend port stays the one in .env.
   *
   * The health probes are absolute paths, so they are rewritten at the root. Every
   * other node route lives under `/api`, which is where the `/api/**` page segment —
   * `app/api/[...rest]` — claims the path before a rewrite at this level can. It
   * serves an empty module on purpose: that segment has to exist to beat the
   * filesystem route, and a 404 from it would be indistinguishable from a real one.
   */
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:13001";
    const target = api.replace(/\/+$/, "");
    return [
      { source: "/readyz", destination: `${target}/readyz` },
      { source: "/healthz", destination: `${target}/healthz` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
