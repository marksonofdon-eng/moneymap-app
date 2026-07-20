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
  sourceAccountName: string | null;
  approximatePaymentDay: number | null;
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

type RankedOffer = {
  id: number;
  providerName: string;
  planName: string;
  connectionType: string;
  maxDownloadSpeed: number;
  monthlyCostAud: number;
  savingMonthlyAud: number;
  deepLinkUrl: string | null;
  accessFamily: string;
};

type BillTransaction = {
  transactionId: string;
  amountAud: number;
  postDate: string | null;
  accountName: string | null;
  matchedText: string;
  direction: string;
};

type RecommendationResult = {
  outcome:
    | "ALREADY_BEST"
    | "SWITCH_RECOMMENDED"
    | "NO_ELIGIBLE"
    | "NOT_READY";
  reason: string | null;
  currentMonthlyAud: number;
  eligibleCount: number;
  bestDeal: RankedOffer | null;
  topOffers: RankedOffer[];
  savingMonthlyAud: number;
};

type FormState = {
  line1: string;
  line2: string;
  suburb: string;
  state: AustralianStateCode;
  postcode: string;
  minDownloadMbps: number;
};

const SERVICE_TIERS = [
  {
    id: "basic",
    size: "Basic",
    title: "Everyday browsing",
    detail: "Email, social media, and light web use",
    mbps: 100,
  },
  {
    id: "standard",
    size: "Standard",
    title: "Streaming & video calls",
    detail: "HD streaming, Zoom, and a couple of devices",
    mbps: 250,
  },
  {
    id: "plus",
    size: "Plus",
    title: "Family household",
    detail: "Several streams, homework, and smart devices",
    mbps: 500,
  },
  {
    id: "ultra",
    size: "Ultra",
    title: "Gaming & 4K",
    detail: "4K streaming, large downloads, and heavy use",
    mbps: 1000,
  },
] as const;

function nearestTierMbps(value: number): number {
  let best: number = SERVICE_TIERS[0].mbps;
  let bestDelta = Math.abs(value - best);
  for (const tier of SERVICE_TIERS) {
    const delta = Math.abs(value - tier.mbps);
    if (delta < bestDelta) {
      best = tier.mbps;
      bestDelta = delta;
    }
  }
  return best;
}

function formatAddressSummary(form: FormState) {
  const street = [form.line1.trim(), form.line2.trim()]
    .filter(Boolean)
    .join(", ");
  const locality = [form.suburb.trim(), form.state, form.postcode.trim()]
    .filter(Boolean)
    .join(" ");
  return [street, locality].filter(Boolean).join(" · ");
}

function InternetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AddressIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ChoiceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h10M4 12h16M4 17h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16 5l4 2.5L16 10V5zM16 14l4 2.5L16 19v-5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function dayOrdinal(day: number) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function billPaymentMeta(bill: BillSummary) {
  const parts = [bill.providerName];
  if (bill.sourceAccountName) {
    parts.push(`from ${bill.sourceAccountName}`);
  }
  if (bill.approximatePaymentDay != null) {
    parts.push(
      `around the ${dayOrdinal(bill.approximatePaymentDay)} day of each month`,
    );
  }
  return parts.join(" · ");
}

function formatTxDate(value: string | null) {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

const emptyForm: FormState = {
  line1: "",
  line2: "",
  suburb: "",
  state: "NSW",
  postcode: "",
  minDownloadMbps: 250,
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
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [recommendation, setRecommendation] =
    useState<RecommendationResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [resultFocusKey, setResultFocusKey] = useState(0);
  const [editingAddress, setEditingAddress] = useState(false);
  const [editingUsage, setEditingUsage] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [billTransactions, setBillTransactions] = useState<
    BillTransaction[] | null
  >(null);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(
    null,
  );

  const loadRecommendation = useCallback(async (opts?: { scroll?: boolean }) => {
    const shouldScroll = Boolean(opts?.scroll);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setComparing(true);
    setCompareError(null);
    setError(null);
    try {
      const response = await fetch("/api/internet-savings/recommendations", {
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const raw =
          typeof body.error === "string" ? body.error : "Could not compare plans";
        throw new Error(
          raw === "recommendation_failed" || raw === "unauthorized"
            ? "Could not compare plans. Try again in a moment."
            : raw,
        );
      }
      const next = body.recommendation as RecommendationResult | undefined;
      if (!next) {
        throw new Error("No comparison result returned");
      }
      setRecommendation(next);
      if (next.outcome === "NOT_READY") {
        setCompareError(
          next.reason || "Save details and check availability first.",
        );
      }
      if (shouldScroll) {
        setResultFocusKey((key) => key + 1);
      }
    } catch (cause) {
      setRecommendation(null);
      const message =
        cause instanceof Error && cause.name === "AbortError"
          ? "Comparison timed out. Refresh and try again."
          : cause instanceof Error
            ? cause.message
            : "Could not compare plans";
      setCompareError(message);
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      setComparing(false);
    }
  }, []);

  useEffect(() => {
    if (!recommendation || resultFocusKey === 0) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("internet-savings-result")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [recommendation, resultFocusKey]);

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
      const nextCapability =
        (capabilityBody.assessment as CapabilityAssessment | null) ?? null;
      setCapability(nextCapability);
      const nextForm: FormState = {
        line1: data.address?.line1 ?? "",
        line2: data.address?.line2 ?? "",
        suburb: data.address?.suburb ?? "",
        state:
          (data.address?.state as AustralianStateCode | undefined) ?? "NSW",
        postcode: data.address?.postcode ?? "",
        minDownloadMbps: nearestTierMbps(data.prefs?.minDownloadMbps ?? 250),
      };
      setForm(nextForm);
      const isSaved = Boolean(data.prefs?.readyForAssess);
      setSaved(isSaved);
      setSavedForm(isSaved ? nextForm : null);
      setEditingAddress(!isSaved);
      setEditingUsage(!isSaved);
      setCapability(nextCapability);
      // Leave compare for the button — avoids blocking first paint on catalog load.
      setRecommendation(null);
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

  const selectedTier = useMemo(
    () =>
      SERVICE_TIERS.find((tier) => tier.mbps === form.minDownloadMbps) ??
      SERVICE_TIERS[1],
    [form.minDownloadMbps],
  );

  const dirty = useMemo(() => {
    if (!savedForm) return true;
    return (
      form.line1 !== savedForm.line1 ||
      form.line2 !== savedForm.line2 ||
      form.suburb !== savedForm.suburb ||
      form.state !== savedForm.state ||
      form.postcode !== savedForm.postcode ||
      form.minDownloadMbps !== savedForm.minDownloadMbps
    );
  }, [form, savedForm]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
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
          minDownloadMbps: form.minDownloadMbps,
          allowWired: true,
          allow5g: true,
          allowStarlink: true,
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
      setSavedForm(form);
      setEditingAddress(false);
      setEditingUsage(false);
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
      void assessCapabilities();
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
      await loadRecommendation({ scroll: true });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Availability check failed",
      );
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return (
      <div className="internet-savings">
        <div className="page-welcome">
          <p className="internet-savings-kicker">Internet bill</p>
          <h1 className="page-title">Internet Savings</h1>
          <p className="muted internet-savings-lede">Loading your details…</p>
        </div>
      </div>
    );
  }

  if (!intake?.hasDetectedBill) {
    return (
      <div className="internet-savings">
        <div className="page-welcome">
          <p className="internet-savings-kicker">Internet bill</p>
          <h1 className="page-title">Internet Savings</h1>
          <p className="muted internet-savings-lede">
            We need a detected internet bill before we can compare market
            offers.
          </p>
        </div>

        <section className="section internet-savings-empty">
          <strong>No internet bill detected yet</strong>
          <p className="muted">
            Link your bank, then wait for a recurring ISP payment to be found.
            Once detected, you can add your address and preferences here.
          </p>
          <div className="actions" style={{ marginTop: 4 }}>
            <Link href="/app" className="btn secondary">
              Back to dashboard
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const bill = intake.bill;
  const addressSummary = formatAddressSummary(form);
  const usageSpeedLabel =
    selectedTier.mbps >= 1000
      ? `${selectedTier.mbps / 1000} Gbps`
      : `${selectedTier.mbps} Mbps`;
  const isStandardTier = selectedTier.id === "standard";
  const addressOnFile = Boolean(
    savedForm?.line1.trim() &&
      savedForm?.suburb.trim() &&
      savedForm?.postcode.trim(),
  );
  const usageOnFile = Boolean(saved && savedForm);
  const showAddressFields = !addressOnFile || editingAddress;
  const showUsageFields = !usageOnFile || editingUsage;
  const availableOptions =
    capability?.status === "READY" && !capability.stale
      ? capability.options.filter((option) => option.available)
      : [];

  function cancelAddressEdit() {
    if (savedForm) {
      setForm((prev) => ({
        ...prev,
        line1: savedForm.line1,
        line2: savedForm.line2,
        suburb: savedForm.suburb,
        state: savedForm.state,
        postcode: savedForm.postcode,
      }));
    }
    setEditingAddress(false);
  }

  function cancelUsageEdit() {
    if (savedForm) {
      setForm((prev) => ({
        ...prev,
        minDownloadMbps: savedForm.minDownloadMbps,
      }));
    }
    setEditingUsage(false);
  }

  const availabilityUnderAddress =
    addressOnFile && !showAddressFields ? (
      <>
        {checking ? (
          <span className="internet-savings-availability-line">
            Checking availability…
          </span>
        ) : null}

        {capability?.stale ? (
          <span className="internet-savings-warning">
            Address changed —{" "}
            <button
              type="button"
              className="internet-savings-text-btn"
              disabled={checking}
              onClick={() => void assessCapabilities()}
            >
              check again
            </button>
          </span>
        ) : null}

        {capability?.status === "FAILED" ? (
          <span className="error">
            {capability.failureReason || "Couldn’t check this address."}{" "}
            <button
              type="button"
              className="internet-savings-text-btn"
              disabled={checking}
              onClick={() => void assessCapabilities()}
            >
              Try again
            </button>
          </span>
        ) : null}

        {capability?.status === "READY" && !capability.stale ? (
          availableOptions.length === 0 ? (
            <span className="internet-savings-availability-line">
              No services found here yet
            </span>
          ) : (
            availableOptions.map((option) => {
              const name =
                option.accessFamily === "NBN"
                  ? `NBN ${option.connectionType ?? ""}`.trim()
                  : option.accessFamily;
              const speed =
                option.maxDownMbps != null
                  ? `up to ${option.maxDownMbps} Mbps`
                  : null;
              const isSuperfast =
                option.maxDownMbps != null && option.maxDownMbps >= 1000;
              return (
                <span
                  key={option.id}
                  className="internet-savings-availability-line"
                >
                  Available {name}
                  {speed ? ` · ${speed}` : ""}
                  {isSuperfast ? (
                    <span className="internet-savings-speed-tag internet-savings-speed-tag--green">
                      SUPERFAST
                    </span>
                  ) : null}
                </span>
              );
            })
          )
        ) : null}

        {!checking && !capability ? (
          <button
            type="button"
            className="internet-savings-text-btn"
            disabled={checking}
            onClick={() => void assessCapabilities()}
          >
            Check what’s available here
          </button>
        ) : null}
      </>
    ) : null;

  const canCompare =
    saved &&
    !dirty &&
    capability?.status === "READY" &&
    !capability.stale;

  async function toggleBillTransactions() {
    if (showTransactions) {
      setShowTransactions(false);
      return;
    }
    setShowTransactions(true);
    if (billTransactions != null) return;
    setLoadingTransactions(true);
    setTransactionsError(null);
    try {
      const response = await fetch("/api/internet-savings/transactions");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Could not load transactions");
      }
      setBillTransactions(
        (body.transactions as BillTransaction[] | undefined) ?? [],
      );
    } catch (cause) {
      setTransactionsError(
        cause instanceof Error
          ? cause.message
          : "Could not load transactions",
      );
      setBillTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }

  return (
    <div className="internet-savings">
      <div className="page-welcome internet-savings-welcome">
        <div>
          <p className="internet-savings-kicker">Internet bill</p>
          <h1 className="page-title">
            {saved ? "Internet Savings" : "Provide missing details"}
          </h1>
          <p className="muted internet-savings-lede">
            {saved
              ? "Confirm where the service is and how you’ll use it, then compare plans."
              : "Add your address and how you’ll use the internet so we can assess the best offer."}
          </p>
        </div>
        <Link href="/app" className="btn secondary">
          Back to dashboard
        </Link>
      </div>

      {bill ? (
        <section className="section internet-savings-bill-card" aria-label="Detected bill">
          <div className="internet-savings-bill-main">
            <span className="internet-savings-step-icon" aria-hidden="true">
              <InternetIcon />
            </span>
            <div className="internet-savings-bill-copy">
              <strong>Internet</strong>
              <span className="muted">{billPaymentMeta(bill)}</span>
            </div>
            <div className="internet-savings-bill-aside">
              <strong>{money(bill.estimatedMonthlyCostAud)}</strong>
              <span className="muted">per month</span>
            </div>
            <button
              type="button"
              className="internet-savings-edit-btn"
              aria-expanded={showTransactions}
              onClick={() => void toggleBillTransactions()}
            >
              {showTransactions ? "Hide" : "View"}
            </button>
          </div>

          {showTransactions ? (
            <div className="internet-savings-bill-transactions" role="region" aria-label="Internet bill transactions">
              {loadingTransactions ? (
                <p className="muted">Loading transactions…</p>
              ) : null}
              {transactionsError ? (
                <p className="error">{transactionsError}</p>
              ) : null}
              {!loadingTransactions &&
              !transactionsError &&
              billTransactions &&
              billTransactions.length === 0 ? (
                <p className="muted">No linked internet transactions found.</p>
              ) : null}
              {billTransactions && billTransactions.length > 0 ? (
                <ul className="internet-savings-tx-list">
                  {billTransactions.map((tx) => (
                    <li key={tx.transactionId} className="internet-savings-tx-item">
                      <div className="internet-savings-tx-copy">
                        <strong>{tx.matchedText || bill.providerName}</strong>
                        <span className="muted">
                          {formatTxDate(tx.postDate)}
                          {tx.accountName ? ` · ${tx.accountName}` : ""}
                        </span>
                      </div>
                      <strong className="internet-savings-tx-amount">
                        {money(Math.abs(tx.amountAud))}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {!saved ? (
            <div className="internet-savings-missing" role="status">
              <div className="internet-savings-missing-copy">
                <strong>Missing information</strong>
                <span>
                  Additional details are required to assess the best offer.
                </span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="error internet-savings-error">{error}</p> : null}

      <form className="internet-savings-form" onSubmit={onSubmit}>
        <section className="section internet-savings-intake">
          <div className="internet-savings-intake-step">
            <header className="internet-savings-step-head">
              <div className="internet-savings-step-head-main">
                <span className="internet-savings-step-icon" aria-hidden="true">
                  <AddressIcon />
                </span>
                <div>
                  <p className="internet-savings-kicker">Step 1</p>
                  <h2 className="internet-savings-block-title">
                    Internet Speed at your Address
                  </h2>
                </div>
              </div>
              {addressOnFile ? (
                <div className="internet-savings-step-meta">
                  {!showAddressFields ? (
                    <div className="internet-savings-step-meta-value">
                      <strong>{addressSummary || "No address yet"}</strong>
                      {availabilityUnderAddress}
                    </div>
                  ) : (
                    <p className="internet-savings-step-meta-hint muted">
                      Editing address
                    </p>
                  )}
                  {showAddressFields ? (
                    <button
                      type="button"
                      className="internet-savings-edit-btn"
                      onClick={cancelAddressEdit}
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="internet-savings-edit-btn"
                      onClick={() => setEditingAddress(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ) : null}
            </header>

            {!addressOnFile ? (
              <p className="internet-savings-step-lede muted">
                Enter the address where this internet service is installed.
              </p>
            ) : null}

            {showAddressFields ? (
              <>
                {addressOnFile ? (
                  <p className="internet-savings-step-lede muted">
                    Update the address where this internet service is installed.
                  </p>
                ) : null}
                <div className="internet-savings-address">
                  <label className="internet-savings-field internet-savings-field--street">
                    <span className="sr-only">Street address</span>
                    <input
                      required
                      value={form.line1}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, line1: e.target.value }))
                      }
                      placeholder="Street address"
                      autoComplete="address-line1"
                    />
                  </label>
                  <label className="internet-savings-field internet-savings-field--unit">
                    <span className="sr-only">Unit / level</span>
                    <input
                      value={form.line2}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, line2: e.target.value }))
                      }
                      placeholder="Unit (optional)"
                      autoComplete="address-line2"
                    />
                  </label>
                  <label className="internet-savings-field internet-savings-field--suburb">
                    <span className="sr-only">Suburb</span>
                    <input
                      required
                      value={form.suburb}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, suburb: e.target.value }))
                      }
                      placeholder="Suburb"
                      autoComplete="address-level2"
                    />
                  </label>
                  <label className="internet-savings-field internet-savings-field--state">
                    <span className="sr-only">State</span>
                    <select
                      required
                      value={form.state}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          state: e.target.value as AustralianStateCode,
                        }))
                      }
                      aria-label="State"
                    >
                      {AUSTRALIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="internet-savings-field internet-savings-field--postcode">
                    <span className="sr-only">Postcode</span>
                    <input
                      required
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      value={form.postcode}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          postcode: e.target.value,
                        }))
                      }
                      placeholder="Postcode"
                      autoComplete="postal-code"
                    />
                  </label>
                </div>

                {!saved ? (
                  <p className="muted internet-savings-availability-hint">
                    Save your details to see what can be delivered here.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="internet-savings-intake-step">
            <header className="internet-savings-step-head">
              <div className="internet-savings-step-head-main">
                <span className="internet-savings-step-icon" aria-hidden="true">
                  <ChoiceIcon />
                </span>
                <div>
                  <p className="internet-savings-kicker">Step 2</p>
                  <h2 className="internet-savings-block-title">
                    What internet speed do you require?
                  </h2>
                </div>
              </div>
              {usageOnFile ? (
                <div className="internet-savings-step-meta">
                  {!showUsageFields ? (
                    <div className="internet-savings-step-meta-value">
                      <strong>
                        {selectedTier.title} · ~{usageSpeedLabel}
                      </strong>
                      <span className="internet-savings-availability-line">
                        {selectedTier.detail}
                        {isStandardTier ? (
                          <span className="internet-savings-speed-tag internet-savings-speed-tag--amber">
                            STANDARD
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : (
                    <p className="internet-savings-step-meta-hint muted">
                      Editing internet use
                    </p>
                  )}
                  {showUsageFields ? (
                    <button
                      type="button"
                      className="internet-savings-edit-btn"
                      onClick={cancelUsageEdit}
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="internet-savings-edit-btn"
                      onClick={() => setEditingUsage(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ) : null}
            </header>

            {!usageOnFile ? (
              <p className="internet-savings-step-lede muted">
                Choose the option that best matches how you use the internet.
              </p>
            ) : null}

            {showUsageFields ? (
              <>
                {usageOnFile ? (
                  <p className="internet-savings-step-lede muted">
                    Update the option that best matches how you use the
                    internet.
                  </p>
                ) : null}
                <div
                  className="internet-savings-tiers"
                  role="radiogroup"
                  aria-label="Internet use"
                >
                  {SERVICE_TIERS.map((tier) => {
                    const selected = tier.mbps === form.minDownloadMbps;
                    return (
                      <label
                        key={tier.id}
                        className={
                          selected
                            ? "internet-savings-tier internet-savings-tier--on"
                            : "internet-savings-tier"
                        }
                      >
                        <input
                          type="radio"
                          name="service-tier"
                          value={tier.id}
                          checked={selected}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              minDownloadMbps: tier.mbps,
                            }))
                          }
                        />
                        <span
                          className="internet-savings-tier-radio"
                          aria-hidden="true"
                        />
                        <span className="internet-savings-tier-copy">
                          <strong>
                            <span
                              className={
                                tier.id === "standard"
                                  ? "internet-savings-speed-tag internet-savings-speed-tag--amber"
                                  : "internet-savings-tier-size"
                              }
                            >
                              {tier.size}
                            </span>{" "}
                            {tier.title}
                          </strong>
                          <span>{tier.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="muted internet-savings-tier-output">
                  Looking for plans around{" "}
                  <span className="internet-savings-tier-output-speed">
                    {selectedTier.mbps >= 1000
                      ? `${selectedTier.mbps / 1000} Gbps`
                      : `${selectedTier.mbps} Mbps`}
                  </span>
                </p>
              </>
            ) : null}
          </div>

          <div className="internet-savings-intake-step internet-savings-intake-step--cta">
            <header className="internet-savings-step-head">
              <div className="internet-savings-step-head-main">
                <span
                  className="internet-savings-step-icon internet-savings-step-icon--cta"
                  aria-hidden="true"
                >
                  <CompareIcon />
                </span>
                <div>
                  <p className="internet-savings-kicker internet-savings-kicker--cta">
                    Step 3
                  </p>
                  <h2 className="internet-savings-block-title">
                    Find a better plan
                  </h2>
                </div>
              </div>
              <div className="internet-savings-step-meta">
                {canCompare ? (
                  <button
                    type="button"
                    className="internet-savings-cta-btn"
                    disabled={comparing}
                    onClick={() => void loadRecommendation({ scroll: true })}
                  >
                    {comparing ? "Comparing…" : "Compare plans"}
                  </button>
                ) : (
                  <p className="internet-savings-step-meta-hint muted">
                    {dirty
                      ? "Save your updates first"
                      : !saved
                        ? "Complete steps 1 and 2 first"
                        : capability?.stale
                          ? "Re-check availability first"
                          : "Confirm what’s available at your address first"}
                  </p>
                )}
              </div>
            </header>
            <p className="internet-savings-step-lede muted">
              Match market offers to your address and how you use the internet.
            </p>
            {comparing ? (
              <p className="muted internet-savings-compare-status">
                Comparing plans for your address…
              </p>
            ) : null}
            {compareError ? (
              <p className="error internet-savings-compare-status">
                {compareError}
              </p>
            ) : null}
          </div>

          {dirty || !saved ? (
            <div className="internet-savings-intake-footer">
              <div className="internet-savings-intake-footer-copy">
                <strong>
                  {saving
                    ? "Saving…"
                    : dirty
                      ? "You have unsaved changes"
                      : "Save your details to continue"}
                </strong>
                <span className="muted">
                  Saves your address and how you use the internet together.
                </span>
              </div>
              <div className="internet-savings-intake-footer-actions">
                <button type="submit" disabled={saving || !dirty}>
                  {saving
                    ? "Saving…"
                    : saved
                      ? "Update details"
                      : "Save address & internet use"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </form>

      {recommendation ? (
        <section
          id="internet-savings-result"
          className="section internet-savings-result"
          aria-label="Plan comparison result"
        >
          <div className="internet-savings-block-head">
            <p className="internet-savings-kicker">Plan comparison</p>
            <h2 className="internet-savings-block-title">Your best options</h2>
          </div>

          {recommendation.outcome === "NOT_READY" ? (
            <div className="internet-savings-result-banner">
              <strong>Not ready to compare yet</strong>
              <p>
                {recommendation.reason ??
                  "Save your details and confirm what’s available at this address first."}
              </p>
            </div>
          ) : null}

          {recommendation.outcome === "ALREADY_BEST" ? (
            <div className="internet-savings-result-banner internet-savings-result-banner--best">
              <strong>You’re already on a competitive deal</strong>
              <p>
                {recommendation.reason ??
                  "No worthwhile switch found for your address and usage."}
              </p>
            </div>
          ) : null}

          {recommendation.outcome === "SWITCH_RECOMMENDED" &&
          recommendation.bestDeal ? (
            <div className="internet-savings-result-banner internet-savings-result-banner--switch">
              <strong>Bill switch recommended</strong>
              <p>
                Switch to {recommendation.bestDeal.providerName}{" "}
                {recommendation.bestDeal.planName} and save about{" "}
                {money(recommendation.savingMonthlyAud)} per month versus your
                current ~{money(recommendation.currentMonthlyAud)} bill.
              </p>
            </div>
          ) : null}

          {recommendation.outcome === "NO_ELIGIBLE" ? (
            <div className="internet-savings-result-banner">
              <strong>No matching plans yet</strong>
              <p>
                {recommendation.reason ??
                  "We couldn’t find catalog plans that fit this address and speed."}
              </p>
            </div>
          ) : null}

          {recommendation.topOffers.length > 0 ? (
            <ul className="internet-savings-result-list">
              {recommendation.topOffers.map((offer, index) => (
                <li key={offer.id} className="internet-savings-result-offer">
                  <div>
                    <span className="internet-savings-result-rank">
                      {index === 0 ? "Best match" : `Option ${index + 1}`}
                    </span>
                    <strong>
                      {offer.providerName} · {offer.planName}
                    </strong>
                    <span className="muted">
                      {offer.maxDownloadSpeed} Mbps · {offer.connectionType}
                    </span>
                  </div>
                  <div className="internet-savings-result-offer-aside">
                    <strong>{money(offer.monthlyCostAud)}/mo</strong>
                    <span
                      className={
                        offer.savingMonthlyAud > 2
                          ? "internet-savings-result-saving"
                          : "muted"
                      }
                    >
                      {offer.savingMonthlyAud > 2
                        ? `Save ${money(offer.savingMonthlyAud)}/mo`
                        : "Similar cost"}
                    </span>
                    {offer.deepLinkUrl ? (
                      <a
                        href={offer.deepLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="internet-savings-text-btn"
                      >
                        View plan
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {recommendation.outcome !== "NOT_READY" ? (
            <p className="muted internet-savings-result-meta">
              Compared {recommendation.eligibleCount} eligible plan
              {recommendation.eligibleCount === 1 ? "" : "s"} against your
              current bill.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
