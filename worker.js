const DEFAULT_ORCHESTRATOR_URL = "https://flowkit-global-orchestrator.onrender.com";

async function proxyOrchestrator(request, env) {
  const baseUrl = env.ORCHESTRATOR_API_URL || DEFAULT_ORCHESTRATOR_URL;
  const requestUrl = new URL(request.url);
  const upstreamPath = requestUrl.pathname.replace(/^\/api\/orchestrator\/?/, "");
  const upstream = new URL(upstreamPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  upstream.search = requestUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  if (env.ORCHESTRATOR_API_KEY) headers.set("x-api-key", env.ORCHESTRATOR_API_KEY);

  return fetch(upstream.toString(), {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/orchestrator")) {
      return proxyOrchestrator(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
