"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppClientActions({
  mode,
  hasAccounts = false,
  canAttachLocal = false,
  canExport = false,
  canRescan = false,
  canImport = false,
}: {
  mode: "logout" | "consent" | "attach" | "export" | "rescan" | "import";
  hasAccounts?: boolean;
  canAttachLocal?: boolean;
  canExport?: boolean;
  canRescan?: boolean;
  canImport?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      <>
        <button
          type="button"
          className="stat-icon-btn"
          disabled={busy}
          title="Export transactions"
          aria-label={busy ? "Exporting transactions" : "Export transactions"}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setSuccess(null);
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
          {busy ? <SpinnerIcon /> : <ExportIcon />}
        </button>
        {error ? (
          <span className="error" role="alert">
            {error}
          </span>
        ) : null}
      </>
    );
  }

  if (mode === "rescan") {
    if (!canRescan) return null;
    return (
      <>
        <button
          type="button"
          className="stat-icon-btn"
          disabled={busy}
          title="Rescan bills from saved transactions"
          aria-label={
            busy ? "Rescanning bills" : "Rescan bills from saved transactions"
          }
          onClick={async () => {
            setBusy(true);
            setError(null);
            setSuccess(null);
            try {
              const res = await fetch("/api/bills/rescan", { method: "POST" });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(data.message || "Could not rescan bills.");
                return;
              }
              setSuccess("Rescan complete");
              router.refresh();
            } catch {
              setError("Network error rescanning bills.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <SpinnerIcon /> : <RescanIcon />}
        </button>
        {error ? (
          <span className="error" role="alert">
            {error}
          </span>
        ) : null}
        {success ? (
          <span className="stat-action-success" role="status">
            {success}
          </span>
        ) : null}
      </>
    );
  }

  if (mode === "import") {
    if (!canImport) return null;
    return (
      <>
        <button
          type="button"
          className="stat-icon-btn"
          disabled={busy}
          title="Import new transactions from Open Banking"
          aria-label={
            busy
              ? "Importing transactions"
              : "Import new transactions from Open Banking"
          }
          onClick={async () => {
            setBusy(true);
            setError(null);
            setSuccess(null);
            try {
              const res = await fetch("/api/basiq/import", { method: "POST" });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(data.message || "Could not import transactions.");
                return;
              }
              const total =
                typeof data.total === "number" ? data.total : null;
              setSuccess(
                total != null
                  ? `Imported ${total} transactions`
                  : "Import complete",
              );
              router.refresh();
            } catch {
              setError("Network error importing transactions.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <SpinnerIcon /> : <ImportIcon />}
        </button>
        {error ? (
          <span className="error" role="alert">
            {error}
          </span>
        ) : null}
        {success ? (
          <span className="stat-action-success" role="status">
            {success}
          </span>
        ) : null}
      </>
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
              const res = await fetch("/api/basiq/attach-local", {
                method: "POST",
              });
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

  async function startConsent() {
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
  }

  if (hasAccounts) {
    return (
      <>
        <button
          type="button"
          className="stat-icon-btn"
          disabled={busy}
          title="Link another bank"
          aria-label={busy ? "Starting bank linking" : "Link another bank"}
          onClick={() => void startConsent()}
        >
          {busy ? <SpinnerIcon /> : <AddBankIcon />}
        </button>
        {error ? (
          <span className="error" role="alert">
            {error}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <div className="actions" style={{ marginTop: 0 }}>
      <button type="button" disabled={busy} onClick={() => void startConsent()}>
        {busy ? "Starting…" : "Link bank accounts"}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function AddBankIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M1.5 6.25 9 2.5l7.5 3.75v1.1H1.5v-1.1Zm1.35 2.35h1.8v5.1h-1.8v-5.1Zm3.6 0h1.8v5.1h-1.8v-5.1Zm3.6 0h1.8v5.1H10.05v-5.1ZM1.5 14.4h10.2v1.35H1.5V14.4Z"
      />
      <path
        fill="currentColor"
        d="M14.25 9.75a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5V10.5a.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M9 2.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V3a.75.75 0 0 1 .75-.75ZM3.5 11.5a.75.75 0 0 1 .75.75v1.5c0 .14.11.25.25.25h9c.14 0 .25-.11.25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 13.5 15.5h-9A1.75 1.75 0 0 1 2.75 13.75v-1.5a.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  );
}

function RescanIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M14.25 3.75A6.75 6.75 0 0 0 3.4 6.1a.75.75 0 1 0 1.4.55A5.25 5.25 0 0 1 14.1 5.4l-.85.85a.75.75 0 0 0 .53 1.28h2.47a.75.75 0 0 0 .75-.75V4.3a.75.75 0 0 0-1.28-.53l-.47.48ZM3.75 14.25A6.75 6.75 0 0 0 14.6 11.9a.75.75 0 1 0-1.4-.55A5.25 5.25 0 0 1 3.9 12.6l.85-.85a.75.75 0 0 0-.53-1.28H1.75a.75.75 0 0 0-.75.75v2.47a.75.75 0 0 0 1.28.53l.47-.47Z"
      />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M9 15.75a.75.75 0 0 1-.75-.75V8.81L6.53 10.53a.75.75 0 1 1-1.06-1.06l3-3a.75.75 0 0 1 1.06 0l3 3a.75.75 0 1 1-1.06 1.06L9.75 8.81V15a.75.75 0 0 1-.75.75ZM3.5 6.5a.75.75 0 0 1-.75-.75v-1.5C2.75 3.01 3.76 2 5 2h8c1.24 0 2.25 1.01 2.25 2.25v1.5a.75.75 0 0 1-1.5 0v-1.5c0-.14-.11-.25-.25-.25H5c-.14 0-.25.11-.25.25v1.5a.75.75 0 0 1-.75.75Z"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="admin-icon-spin"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M9 2.25a6.75 6.75 0 1 1-6.53 8.4.75.75 0 1 1 1.45-.38A5.25 5.25 0 1 0 9 3.75V2.25Z"
      />
    </svg>
  );
}
