import type { NextRequest } from "next/server";

/**
 * Bridges `/api/*` to the Chainify node.
 *
 * The node's routes all live under `/api`, which is also a page segment here, so the
 * filesystem route wins before a Next rewrite at the root can match — the rewrite is
 * never consulted. Proxying in a handler keeps the same-origin design (no CORS, no mixed
 * content) and forwards the method, body, and content type so the POST routes work.
 *
 * The upstream base is resolved per request on the server, where process.env is real;
 * the browser bundle never sees it.
 */
const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);

function upstreamBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:13001";
  return configured.replace(/\/+$/, "");
}

async function proxy(request: NextRequest, context: { params: Promise<{ rest: string[] }> }) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  const { rest } = await context.params;
  const target = `${upstreamBase()}/api/${rest.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  const init: RequestInit = {
    method: request.method,
    headers: {
      Accept: request.headers.get("accept") ?? "application/json",
      "Content-Type": request.headers.get("content-type") ?? "application/json",
    },
    cache: "no-store",
  };
  if (request.method === "POST") init.body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json(
      {
        error: "network_error",
        message: "The Chainify node could not be reached from this server.",
      },
      { status: 502 },
    );
  }

  // The body is passed through verbatim: the node already owns its error envelope, and
  // reshaping it here would let the two disagree.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
