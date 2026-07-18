import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  countTransactionsForOwner,
  listAccountsForOwner,
  listTransactionsForOwner,
} from "@/server/data/bankData";
import { getInternetSavingsState } from "@/server/data/internetSavings";
import { AppHeader } from "@/components/AppHeader";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import {
  BillSavingsScan,
  internetBillScanItem,
  pendingExpenseScanItems,
} from "@/components/BillSavingsScan";
import { SavingsJourneyTimeline } from "@/components/SavingsJourneyTimeline";
import { AppClientActions } from "./AppClientActions";
import { LinkedBanner } from "./LinkedBanner";

function formatMoney(value: { toString(): string } | null | undefined, currency = "AUD") {
  if (value == null) return "—";
  const n = Number(value.toString());
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(n);
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

const allowAttachLocal =
  process.env.NODE_ENV === "development" &&
  process.env.ALLOW_ATTACH_LOCAL === "true";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const ownerUserId = user.id;

  const accounts = await listAccountsForOwner(ownerUserId);
  const recentTransactions = await listTransactionsForOwner(ownerUserId, {
    limit: 20,
  });
  const txCount = await countTransactionsForOwner(ownerUserId);
  const internetSavings = await getInternetSavingsState(ownerUserId);

  const totalBalance = accounts.reduce((sum, a) => {
    const n = a.balance != null ? Number(a.balance.toString()) : 0;
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const billScanItems = [
    internetBillScanItem(internetSavings.bill),
    ...pendingExpenseScanItems(),
  ];

  return (
    <div className="shell">
      <AppHeader>
        <a href="/admin/internet-bills">Detected bills</a>
        <a href="/admin/internet-offers">Internet offers</a>
        <AppClientActions mode="logout" />
      </AppHeader>

      <main className="main">
        <div className="panel">
          <div className="panel-head">
            <h1 className="page-title">
              Welcome{user.name ? `, ${user.name}` : ""}
            </h1>
          </div>

          {params.linked ? <LinkedBanner /> : null}

          <div className="stat-row">
            <div className="stat">
              <div className="stat-label">
                <span className="muted">Linked Accounts</span>
                {accounts.length > 0 ? (
                  <AppClientActions mode="consent" hasAccounts />
                ) : null}
              </div>
              <strong>{accounts.length}</strong>
            </div>
            <div className="stat">
              <div className="stat-label">
                <span className="muted">Transactions</span>
                <AppClientActions mode="export" canExport={txCount > 0} />
              </div>
              <strong>{txCount}</strong>
            </div>
            <div className="stat">
              <span className="muted">Total balance</span>
              <strong style={{ fontSize: "1.25rem" }}>
                {accounts.length
                  ? formatMoney(totalBalance, accounts[0]?.currency || "AUD")
                  : "—"}
              </strong>
            </div>
          </div>
        </div>

        <SavingsJourneyTimeline
          hasAccounts={accounts.length > 0}
          hasDetectedBill={internetSavings.hasDetectedBill}
          billConfirmed={internetSavings.bill?.status === "CONFIRMED"}
          intakeReady={internetSavings.intakeReady}
        />

        <CollapsibleSection
          className="accounts-section"
          kicker="Linked accounts"
          icon={<BankIcon />}
          title={
            accounts.length > 0
              ? `${accounts.length} bank account${accounts.length === 1 ? "" : "s"} connected`
              : "Connect a bank to get started"
          }
          headingId="linked-accounts-heading"
          defaultOpen
          summary={
            accounts.length > 0
              ? `Total ${formatMoney(totalBalance, accounts[0]?.currency || "AUD")}`
              : "No accounts linked"
          }
        >
          {accounts.length === 0 ? (
            <div className="empty">
              <p className="muted" style={{ margin: 0 }}>
                No bank accounts yet. Link a bank to pull balances and
                transactions into MoneyMap.
              </p>
              <div className="actions" style={{ marginTop: 0 }}>
                {allowAttachLocal ? (
                  <AppClientActions mode="attach" canAttachLocal />
                ) : null}
                <AppClientActions mode="consent" hasAccounts={false} />
              </div>
            </div>
          ) : (
            <ul className="account-list">
              {accounts.map((account) => (
                <li key={account.accountId} className="account-row">
                  <div className="account-main">
                    <strong>{account.name || "Account"}</strong>
                    <span className="muted">
                      {[
                        account.type,
                        `${account._count.transactions} transactions`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="account-balances">
                    <strong>
                      {formatMoney(account.balance, account.currency)}
                    </strong>
                    <span className="muted">
                      Available{" "}
                      {formatMoney(account.availableBalance, account.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        <BillSavingsScan items={billScanItems} />

        {recentTransactions.length > 0 ? (
          <CollapsibleSection
            className="transactions-section"
            kicker="Recent transactions"
            icon={<TransactionsIcon />}
            title={`Last ${recentTransactions.length} from your linked accounts`}
            headingId="recent-transactions-heading"
            defaultOpen
            summary={`Showing ${recentTransactions.length} recent`}
          >
            <ul className="tx-list">
              {recentTransactions.map((tx) => {
                const amount = Number(tx.amount.toString());
                const signed =
                  tx.direction === "debit"
                    ? -Math.abs(amount)
                    : Math.abs(amount);
                const currency = tx.account.currency || "AUD";
                const label =
                  tx.direction === "debit"
                    ? `Payment · ${tx.account.name || "Account"}`
                    : `Credit · ${tx.account.name || "Account"}`;

                return (
                  <li key={tx.transactionId} className="tx-row">
                    <div className="tx-main">
                      <strong>{label}</strong>
                      <span className="muted">{formatDate(tx.postDate)}</span>
                    </div>
                    <strong
                      className={
                        signed < 0 ? "tx-amount debit" : "tx-amount credit"
                      }
                    >
                      {formatMoney(signed, currency)}
                    </strong>
                  </li>
                );
              })}
            </ul>
          </CollapsibleSection>
        ) : null}
      </main>
    </div>
  );
}

function BankIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 10.5 12 4l9 6.5V13H3v-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M5 13v5M9.5 13v5M14.5 13v5M19 13v5M3.5 20h17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 7h12M7 12h12M7 17h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 7h.01M4 12h.01M4 17h.01"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
