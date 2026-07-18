"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoneyMapLogo } from "@/components/MoneyMapLogo";

const marketingUrl =
  process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:8080";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/app";
  const [email, setEmail] = useState(() => searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!cancelled && res.ok) {
          router.replace(next.startsWith("/") ? next : "/app");
          return;
        }
      } catch {
        // stay on login form
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not sign in.");
        return;
      }
      router.push(next.startsWith("/") ? next : "/app");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="auth-wrap">
        <div className="card muted">Checking session…</div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <MoneyMapLogo asLink={false} />
        <p className="muted">Sign in to your savings dashboard.</p>
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          No account? <Link href="/signup">Create one</Link>
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          <a href={marketingUrl}>← Back to MoneyMap</a>
        </p>
      </div>
    </div>
  );
}
