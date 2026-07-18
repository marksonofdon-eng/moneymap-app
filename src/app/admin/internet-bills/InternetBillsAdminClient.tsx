"use client";

import { useCallback, useEffect, useState } from "react";

type Evidence = {
  transactionId: string;
  matchedText: string;
  matchScore: number;
  matchReasons: string[];
  accountId: string;
  amountAud: number;
  postDate: string | null;
  transactionStatus: string | null;
};

type DetectedBill = {
  id: string;
  providerName: string;
  estimatedMonthlyCostAud: number;
  confidence: number;
  status: "DETECTED" | "CONFIRMED" | "DISMISSED";
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  matcherVersion: string;
  evidence: Evidence[];
};

type DetectionRun = {
  transactionsScanned: number;
  candidatesMatched: number;
  billsDetected: number;
  evidenceLinked: number;
};

type DetectedBillStatus = DetectedBill["status"];

function money(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function InternetBillsAdminClient() {
  const [bills, setBills] = useState<DetectedBill[]>([]);
  const [run, setRun] = useState<DetectionRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/internet-bills");
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to load detected bills");
      }
      setBills(body.bills ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to load detected bills",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/internet-bills", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Detection failed");
      }
      setRun(body.run);
      setBills(body.bills ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Detection failed");
    } finally {
      setScanning(false);
    }
  }

  async function updateStatus(
    billId: string,
    status: DetectedBillStatus,
  ) {
    setStatusBusyId(billId);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/internet-bills/${encodeURIComponent(billId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Status update failed");
      }
      setBills((current) =>
        current.map((bill) =>
          bill.id === billId ? { ...bill, status: body.status } : bill,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Status update failed",
      );
    } finally {
      setStatusBusyId(null);
    }
  }

  return (
    <div className="admin-bills">
      <div className="panel-head">
        <div>
          <h1 className="page-title">Detected internet bills</h1>
          <p className="muted" style={{ margin: 0 }}>
            Recurring ISP payments inferred from your imported transactions.
            Review the evidence before treating a match as confirmed.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || scanning}
          onClick={() => void scan()}
        >
          {scanning ? "Scanning…" : "Scan transactions"}
        </button>
      </div>

      {run && (
        <div className="admin-detection-summary" role="status">
          <span>
            <strong>{run.transactionsScanned}</strong> transactions scanned
          </span>
          <span>
            <strong>{run.candidatesMatched}</strong> ISP candidates
          </span>
          <span>
            <strong>{run.billsDetected}</strong> recurring bills
          </span>
          <span>
            <strong>{run.evidenceLinked}</strong> evidence rows
          </span>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {!error && loading ? (
        <p className="muted">Loading detected bills…</p>
      ) : bills.length === 0 ? (
        <div className="admin-empty-state">
          <strong>No recurring internet bill detected yet</strong>
          <p className="muted">
            Run a scan after bank transactions have been imported. The first
            version requires at least two monthly ISP payments.
          </p>
        </div>
      ) : (
        <div className="admin-bill-list">
          {bills.map((bill) => (
            <details key={bill.id} className="admin-bill-card">
              <summary>
                <span className="admin-bill-provider">
                  <strong>{bill.providerName}</strong>
                  <small>{bill.matcherVersion}</small>
                </span>
                <span>
                  <strong>{money(bill.estimatedMonthlyCostAud)}</strong>
                  <small>estimated monthly</small>
                </span>
                <span>
                  <strong>{bill.confidence}%</strong>
                  <small>confidence</small>
                </span>
                <span>
                  <strong>{bill.occurrenceCount}</strong>
                  <small>payments</small>
                </span>
                <span>
                  <strong
                    className={`admin-bill-status admin-bill-status--${bill.status.toLowerCase()}`}
                  >
                    {bill.status.toLowerCase()}
                  </strong>
                  <small>review status</small>
                </span>
              </summary>

              <div className="admin-bill-evidence">
                <div className="admin-bill-review">
                  <p className="muted">
                    Evidence from {date(bill.firstSeenAt)} to{" "}
                    {date(bill.lastSeenAt)} · last payment{" "}
                    {date(bill.lastSeenAt)}
                  </p>
                  <div className="admin-bill-review-actions">
                    <button
                      type="button"
                      disabled={
                        statusBusyId === bill.id ||
                        bill.status === "CONFIRMED"
                      }
                      onClick={() =>
                        void updateStatus(bill.id, "CONFIRMED")
                      }
                    >
                      Confirm match
                    </button>
                    <button
                      type="button"
                      className="secondary admin-dismiss-btn"
                      disabled={
                        statusBusyId === bill.id ||
                        bill.status === "DISMISSED"
                      }
                      onClick={() =>
                        void updateStatus(bill.id, "DISMISSED")
                      }
                    >
                      Dismiss
                    </button>
                    {bill.status !== "DETECTED" && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={statusBusyId === bill.id}
                        onClick={() =>
                          void updateStatus(bill.id, "DETECTED")
                        }
                      >
                        Reset review
                      </button>
                    )}
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table admin-evidence-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Matched text</th>
                        <th>Reasons</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bill.evidence.map((evidence) => (
                        <tr key={evidence.transactionId}>
                          <td>{date(evidence.postDate)}</td>
                          <td>{money(evidence.amountAud)}</td>
                          <td>{evidence.matchedText}</td>
                          <td>{evidence.matchReasons.join(", ")}</td>
                          <td>{evidence.matchScore}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
