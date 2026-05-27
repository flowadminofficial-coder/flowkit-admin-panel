import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_ORCHESTRATOR_URL = "https://flowkit-global-orchestrator.onrender.com";
const DEFAULT_FIREBASE_PROJECT_ID = "veo3-57e3e";
const SUPER_ADMIN_EMAIL = "runjawon@gmail.com";
const allowedStatuses = new Set(["approved", "pending", "blocked"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function userKey(email) {
  return `user:${normalizeEmail(email)}`;
}

function tokenFromRequest(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

let jwks;

async function verifyFirebaseUser(request, env) {
  const token = tokenFromRequest(request);
  if (!token) throw new Error("Missing Firebase bearer token.");
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not configured.");
  jwks ||= createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const email = normalizeEmail(payload.email);
  if (!email || payload.email_verified === false) throw new Error("Google email is not verified.");
  return {
    uid: payload.sub,
    email,
    name: payload.name || "",
    picture: payload.picture || "",
  };
}

async function getAccessRecord(env, user) {
  const superAdminEmail = normalizeEmail(env.SUPER_ADMIN_EMAIL || SUPER_ADMIN_EMAIL);
  const isSuperAdmin = user.email === superAdminEmail;
  const now = new Date().toISOString();
  const fallbackRecord = {
    email: user.email,
    name: user.name,
    status: isSuperAdmin ? "approved" : "pending",
    role: isSuperAdmin ? "super_admin" : "viewer",
    super_admin: isSuperAdmin,
    last_seen_at: now,
  };

  if (!env.ADMIN_USERS) return fallbackRecord;

  const key = userKey(user.email);
  const existing = await env.ADMIN_USERS.get(key, "json");
  const record = {
    ...fallbackRecord,
    ...(existing || {}),
    email: user.email,
    name: user.name || existing?.name || "",
    super_admin: isSuperAdmin,
    status: isSuperAdmin ? "approved" : existing?.status || fallbackRecord.status,
    role: isSuperAdmin ? "super_admin" : existing?.role || fallbackRecord.role,
    last_seen_at: now,
  };
  await env.ADMIN_USERS.put(key, JSON.stringify(record));
  return record;
}

async function requireApprovedAdmin(request, env) {
  const user = await verifyFirebaseUser(request, env);
  const access = await getAccessRecord(env, user);
  if (access.status !== "approved") {
    return { user, access, response: json(access, 403) };
  }
  return { user, access };
}

async function requireSuperAdmin(request, env) {
  const auth = await requireApprovedAdmin(request, env);
  if (auth.response) return auth;
  if (!auth.access.super_admin) {
    return { ...auth, response: json({ error: "Super admin access required." }, 403) };
  }
  return auth;
}

async function proxyOrchestrator(request, env) {
  const auth = await requireApprovedAdmin(request, env);
  if (auth.response) return auth.response;

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

async function listAccessRecords(env) {
  if (!env.ADMIN_USERS) return [];
  const entries = await env.ADMIN_USERS.list({ prefix: "user:" });
  const records = await Promise.all(entries.keys.map((item) => env.ADMIN_USERS.get(item.name, "json")));
  return records.filter(Boolean).sort((a, b) => a.email.localeCompare(b.email));
}

async function handleAdminApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/admin/me") {
    try {
      const user = await verifyFirebaseUser(request, env);
      const access = await getAccessRecord(env, user);
      return json(access, access.status === "approved" ? 200 : 403);
    } catch (error) {
      return json({ status: "unauthenticated", error: error.message }, 401);
    }
  }

  if (url.pathname === "/api/admin/access" && request.method === "GET") {
    const auth = await requireSuperAdmin(request, env);
    if (auth.response) return auth.response;
    return json({ users: await listAccessRecords(env) });
  }

  if (url.pathname === "/api/admin/access" && request.method === "POST") {
    const auth = await requireSuperAdmin(request, env);
    if (auth.response) return auth.response;
    if (!env.ADMIN_USERS) return json({ error: "ADMIN_USERS KV binding is not configured." }, 500);
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const status = String(body.status || "pending").toLowerCase();
    if (!email || !allowedStatuses.has(status)) return json({ error: "Invalid access update." }, 400);
    const existing = (await env.ADMIN_USERS.get(userKey(email), "json")) || { email };
    const record = {
      ...existing,
      email,
      status,
      role: body.role || existing.role || "viewer",
      super_admin: email === normalizeEmail(env.SUPER_ADMIN_EMAIL || SUPER_ADMIN_EMAIL),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.email,
    };
    if (record.super_admin) {
      record.status = "approved";
      record.role = "super_admin";
    }
    await env.ADMIN_USERS.put(userKey(email), JSON.stringify(record));
    return json(record);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/admin")) {
      return handleAdminApi(request, env);
    }
    if (url.pathname.startsWith("/api/orchestrator")) {
      try {
        return await proxyOrchestrator(request, env);
      } catch (error) {
        return json({ error: error.message || "Unauthorized" }, 401);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
