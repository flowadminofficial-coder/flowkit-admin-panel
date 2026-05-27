"use client";

import { ShieldCheck, LogOut, UserCheck } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import {
  firebaseReady,
  getFreshToken,
  signInWithGoogle,
  signOutAdmin,
  watchAuth,
} from "@/lib/firebase";
import type { User } from "firebase/auth";

type AccessStatus = {
  email?: string;
  name?: string;
  role?: string;
  status: "approved" | "pending" | "blocked" | "unauthenticated";
  super_admin?: boolean;
};

async function fetchAccessStatus(token: string): Promise<AccessStatus> {
  const response = await fetch("/api/admin/me", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 403) return response.json() as Promise<AccessStatus>;
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<AccessStatus>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return watchAuth(async (nextUser) => {
      setUser(nextUser);
      setAccess(null);
      setError(null);
      if (!nextUser) {
        setLoading(false);
        return;
      }
      try {
        const token = await getFreshToken(nextUser);
        if (!token) throw new Error("Missing Firebase token.");
        setAccess(await fetchAccessStatus(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to verify admin access.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  if (!firebaseReady) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <ShieldCheck size={34} />
          <h1>Firebase auth is not configured</h1>
          <p>Add the Firebase public config variables in Cloudflare, then redeploy the admin Worker.</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <ShieldCheck size={34} />
          <h1>Checking admin access</h1>
          <p>Verifying your Google session with Firebase.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <ShieldCheck size={34} />
          <h1>FlowKit Admin</h1>
          <p>Sign in with an approved Google account to manage workers, queues, and Flow settings.</p>
          {error ? <div className="auth-error">{error}</div> : null}
          <button className="primary-button w-full" onClick={() => signInWithGoogle().catch((err) => setError(err.message))}>
            <UserCheck size={18} />
            Sign in with Google
          </button>
        </section>
      </main>
    );
  }

  if (access?.status !== "approved") {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <ShieldCheck size={34} />
          <h1>{access?.status === "blocked" ? "Access blocked" : "Access pending"}</h1>
          <p>
            {access?.status === "blocked"
              ? "This Google account is blocked from the admin panel."
              : "Your login request was recorded. A super admin must approve this account before access is granted."}
          </p>
          <div className="auth-user">{user.email}</div>
          <button className="command-button w-full justify-center" onClick={() => signOutAdmin()}>
            <LogOut size={16} />
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="auth-bar">
        <span>{user.email}</span>
        {access.super_admin ? <strong>Super admin</strong> : <strong>{access.role || "Admin"}</strong>}
        <button className="command-button h-8" onClick={() => signOutAdmin()}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>
      {children}
    </>
  );
}
