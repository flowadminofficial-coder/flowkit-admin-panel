import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const DEFAULT_ORCHESTRATOR_URL = "http://localhost:8090";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function forward(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const baseUrl = process.env.ORCHESTRATOR_API_URL || DEFAULT_ORCHESTRATOR_URL;
  const upstream = new URL(path.join("/"), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  upstream.search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  if (process.env.ORCHESTRATOR_API_KEY) headers.set("x-api-key", process.env.ORCHESTRATOR_API_KEY);

  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    cache: "no-store",
  });

  const body = await response.arrayBuffer();
  const responseHeaders = new Headers();
  const upstreamContentType = response.headers.get("content-type");
  if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);

  return new NextResponse(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}
