"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AUSTRALIAN_STATES, type AustralianStateCode } from "@/lib/australianStates";

type BillSummary = {
  id: string;
  providerName: string;
  estimatedMonthlyCostAud: number;
  confidence: number;
  status: string;
  occurrenceCount: number;
  lastSeenAt: string;
};

type IntakeResponse = {
  hasDetectedBill: boolean;
  bill: BillSummary | null;
  address: {
    line1: string;
    line2: string | null;
    suburb: string;
    state: string;
    postcode: string;
  } | null;
  prefs: {
    minDownloadMbps: number;
    allowWired: boolean;
    allow5g: boolean;
    allowStarlink: boolean;
    readyForAssess: boolean;
  } | null;
};

type CapabilityAssessment = {
  id: string;
  provider: string;
  status: "PENDING" | "READY" | "FAILED";
  checkedAt: string;
  stale: boolean;
  failureReason: string | null;
  options: Array<{
    id: string;
    accessFamily: "NBN" | "FIVE_G" | "STARLINK";
    connectionType: string | null;
    available: boolean;
    maxDownMbps: number | null;
    maxUpMbps: number | null;
    typicalEveningMbps: number | null;
    confidence: number;
    notes: string | null;
  }>;
};

type FormState = {
  line1: string;
  line2: string;
  suburb: string;
  state: AustralianStateCode;
  postcode: string;
  minDownloadMbps: string;
  allowWired: boolean;
  allow5g: boolean;
  allowStarlink: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

const emptyForm: FormState = {
  line1: "",
  line2: "",
  suburb: "",
  state: "NSW",
  postcode: "",
  minDownloadMbps: "100",
  allowWired: true,
  allow5g: true,
  allowStarlink: true,
};

export function InternetSavingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [capability, setCapability] =
    useState<CapabilityAssessment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intakeResponse, capabilityResponse] = await Promise.all([
        fetch("/api/internet-savings/intake"),
        fetch("/api/internet-savings/capabilities"),
      ]);
      const [body, capabilityBody] = await Promise.all([
        intakeResponse.json(),
        capabilityResponse.json(),
      ]);
      if (!intakeResponse.ok) {
        throw new Error(body.error || "Failed to load Internet Savings");
      }
      if (!capabilityResponse.ok) {
        throw new Error(
          capabilityBody.error || "Failed to load address capabilities",
        );
      }
      const data = body as IntakeResponse;
      setIntake(data);
      setCapability(capabilityBody.assessment ?? null);
      setForm({
        line1: data.address?.line1 ?? "",
        line2: data.address?.line2 ?? "",
        suburb: data.address?.suburb ?? "",
        state:
          (data.address?.state as AustralianStateCode | undefined) ?? "NSW",
        postcode: data.address?.postcode ?? "",
        minDownloadMbps: String(data.prefs?.minDownloadMbps ?? 100),
        allowWired: data.prefs?.allowWired ?? true,
        allow5g: data.prefs?.allow5g ?? true,
        allowStarlink: data.prefs?.allowStarlink ?? true,
      });
      setSaved(Boolean(data.prefs?.readyForAssess));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to load Internet Savings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deliveryOk = useMemo(
    () => form.allowWired || form.allow5g || form.allowStarlink,
    [form.allowWired, form.allow5g, form.allowStarlink],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!deliveryOk) {
      setError("Select at least one delivery method.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/internet-savings/intake", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line1: form.line1,
          line2: form.line2 || undefined,
          suburb: form.suburb,
          state: form.state,
          postcode: form.postcode,
          minDownloadMbps: Number(form.minDownloadMbps),
          allowWired: form.allowWired,
          allow5g: form.allow5g,
          allowStarlink: form.allowStarlink,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.error === "no_detected_bill") {
          throw new Error(
            "An internet bill must be detected before saving preferences.",
          );
        }
        throw new Error(body.error || "Could not save intake");
      }
      setSaved(true);
      // Address/preferences may have changed; require a fresh assessment.
      setCapability(null);
      setIntake((prev) =>
        prev
          ? {
              ...prev,
              address: body.address,
              prefs: body.prefs,
              bill: body.bill ?? prev.bill,
            }
          : prev,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save intake");
    } finally {
      setSaving(false);
    }
  }

  async function assessCapabilities() {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/internet-savings/capabilities", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.error === "intake_not_ready") {
          throw new Error("Save your address and speed preferences first.");
        }
        throw new Error(
          body.assessment?.failureReason ||
            body.error ||
            "Availability check failed",
        );
      }
      setCapability(body.assessment);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Availability check failed",
      );
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading Internet Savings…</p>;
  }

  if (!intake?.hasDetectedBill) {
    return (
      <div className="internet-savings">
        <div className="panel-head">
          <div>
            <h1 className="page-title">Internet Savings</h1>
            <p className="muted" style={{ margin: 0 }}>
              We need a detected internet bill before we can compare market
              offers.
            </p>
          </div>
        </div>
        <div className="admin-empty-state">
          <strong>No internet bill detected yet</strong>
          <p className="muted">
            Link your bank (or wait for transaction sync), then ask an admin to
            scan detected bills. Once a recurring ISP payment is found, this
            button turns green and you can enter your address.
          </p>
          <div className="actions" style={{ justifyContent: "center" }}>
            <Link href="/app" className="btn secondary">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="internet-savings">
      <div className="panel-head">
        <div>
          <h1 className="page-title">Internet Savings</h1>
          <p className="muted" style={{ margin: 0 }}>
            Tell us where the service is and how you are willing to receive
            speed. We will use this before checking what is available at your
            address.
          </p>
        </div>
        <Link href="/app" className="btn secondary">
          Home
        </Link>
      </div>

      {intake.bill && (
        <div className="internet-savings-bill" role="status">
          <span>
            Comparing against <strong>{intake.bill.providerName}</strong>
          </span>
          <span>
            ~{money(intake.bill.estimatedMonthlyCostAud)}
            /mo
          </span>
          <span>{intake.bill.confidence}% confidence</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {saved && !error && (
        <p className="admin-notice">
          Saved — next we will check what speeds are available at this address.
        </p>
      )}

      <form className="internet-savings-form" onSubmit={onSubmit}>
        <fieldset>
          <legend>Service address</legend>
          <label>
            Street address
            <input
              required
              value={form.line1}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, line1: e.target.value }))
              }
              placeholder="12 Example Street"
            />
          </label>
          <label>
            Address line 2
            <input
              value={form.line2}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, line2: e.target.value }))
              }
              placeholder="Unit / level (optional)"
            />
          </label>
          <div className="internet-savings-row">
            <label>
              Suburb
              <input
                required
                value={form.suburb}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, suburb: e.target.value }))
                }
              />
            </label>
            <label>
              State
              <select
                required
                value={form.state}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    state: e.target.value as AustralianStateCode,
                  }))
                }
              >
                {AUSTRALIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Postcode
              <input
                required
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={form.postcode}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, postcode: e.target.value }))
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Speed preferences</legend>
          <label>
            Minimum download (Mbps)
            <input
              required
              type="number"
              min={1}
              max={10000}
              value={form.minDownloadMbps}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  minDownloadMbps: e.target.value,
                }))
              }
            />
          </label>
          <p className="muted internet-savings-hint">
            How are you willing to receive that speed?
          </p>
          <div className="internet-savings-checks">
            <label className="admin-check">
              <input
                type="checkbox"
                checked={form.allowWired}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    allowWired: e.target.checked,
                  }))
                }
              />
              <span>Wired / NBN</span>
            </label>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={form.allow5g}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, allow5g: e.target.checked }))
                }
              />
              <span>5G home wireless</span>
            </label>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={form.allowStarlink}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    allowStarlink: e.target.checked,
                  }))
                }
              />
              <span>Starlink</span>
            </label>
          </div>
          {!deliveryOk && (
            <p className="error">Select at least one delivery method.</p>
          )}
        </fieldset>

        <div className="actions" style={{ marginTop: 0 }}>
          <button type="submit" disabled={saving || !deliveryOk}>
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </div>
      </form>

      {saved && (
        <section className="internet-capability">
          <div className="section-head">
            <div>
              <h2 className="section-title">Address availability</h2>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                Check which physical internet services can be delivered to this
                address.
              </p>
            </div>
            <button
              type="button"
              disabled={checking}
              onClick={() => void assessCapabilities()}
            >
              {checking
                ? "Checking…"
                : capability
                  ? "Check again"
                  : "Check what’s available"}
            </button>
          </div>

          {capability?.stale && (
            <p className="internet-capability-warning">
              The saved address has changed. Run the availability check again.
            </p>
          )}

          {capability?.status === "FAILED" && (
            <p className="error">
              {capability.failureReason || "Availability check failed."}
            </p>
          )}

          {capability?.status === "READY" && !capability.stale && (
            <>
              <div className="internet-capability-options">
                {capability.options.map((option) => (
                  <article key={option.id} className="internet-capability-card">
                    <div>
                      <span className="internet-capability-badge">
                        {option.available ? "Available" : "Unavailable"}
                      </span>
                      <h3>
                        {option.accessFamily === "NBN"
                          ? `NBN ${option.connectionType ?? ""}`.trim()
                          : option.accessFamily}
                      </h3>
                    </div>
                    <dl>
                      <div>
                        <dt>Maximum download</dt>
                        <dd>
                          {option.maxDownMbps != null
                            ? `${option.maxDownMbps} Mbps`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Maximum upload</dt>
                        <dd>
                          {option.maxUpMbps != null
                            ? `${option.maxUpMbps} Mbps`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Typical evening</dt>
                        <dd>
                          {option.typicalEveningMbps != null
                            ? `${option.typicalEveningMbps} Mbps`
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    {option.notes && (
                      <p className="muted">{option.notes}</p>
                    )}
                  </article>
                ))}
              </div>
              <p className="muted internet-capability-meta">
                Checked {new Date(capability.checkedAt).toLocaleString("en-AU")}{" "}
                using {capability.provider}. For Stage 3 testing, every saved
                address is assumed to support NBN HFC.
              </p>
              <button type="button" disabled>
                Continue to compare plans (Stage 4)
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
