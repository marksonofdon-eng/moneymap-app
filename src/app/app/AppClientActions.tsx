"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppClientActions({
  mode,
  hasAccounts = false,
  canAttachLocal = false,
  canExport = false,
}: {
  mode: "logout" | "consent" | "attach" | "export";
  hasAccounts?: boolean;
  canAttachLocal?: boolean;
  canExport?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === "logout") {
    return (
      <button
        className="secondary"
        type="button"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
    );
  }

  if (mode === "export") {
    if (!canExport) return null;
    return (
      <div className="actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/transactions/export");
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message || "Could not export transactions.");
                return;
              }
              const blob = await res.blob();
              const disposition = res.headers.get("Content-Disposition") || "";
              const match = disposition.match(/filename="([^"]+)"/);
              const filename = match?.[1] || "moneymap-transactions.csv";
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } catch {
              setError("Network error exporting transactions.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Exporting…" : "Export transactions"}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  }

  if (mode === "attach") {
    if (!canAttachLocal) return null;
    return (
      <div className="actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/basiq/attach-local", { method: "POST" });
              const data = await res.json();
              if (!res.ok) {
                setError(data.message || "Could not attach local bank data.");
                return;
              }
              router.refresh();
            } catch {
              setError("Network error attaching local data.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Loading…" : "Show existing bank data (dev)"}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="actions" style={{ marginTop: 0 }}>
      <button
        type="button"
        className={hasAccounts ? "secondary" : undefined}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/basiq/consent", { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
              setError(data.message || "Could not start bank linking.");
              setBusy(false);
              return;
            }
            window.location.assign(data.browserLink);
          } catch {
            setError("Network error starting consent.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Starting…" : hasAccounts ? "Link another bank" : "Link bank accounts"}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
