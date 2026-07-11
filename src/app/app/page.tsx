import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  countTransactionsForOwner,
  listAccountsForOwner,
  listTransactionsForOwner,
} from "@/server/data/bankData";
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

  const totalBalance = accounts.reduce((sum, a) => {
    const n = a.balance != null ? Number(a.balance.toString()) : 0;
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          Money<span>Map</span>
        </div>
        <AppClientActions mode="logout" />
      </header>

      <main className="main">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h1 className="page-title">
                Welcome{user.name ? `, ${user.name}` : ""}
              </h1>
              <p className="muted" style={{ margin: 0 }}>
                Signed in as <strong style={{ color: "var(--fg)" }}>{user.email}</strong>
              </p>
            </div>
            <div className="actions" style={{ marginTop: 0 }}>
              <AppClientActions mode="export" canExport={txCount > 0} />
              <AppClientActions
                mode="consent"
                hasAccounts={accounts.length > 0}
              />
            </div>
          </div>

          {params.linked ? <LinkedBanner /> : null}

          <div className="stat-row">
            <div className="stat">
              <span className="muted">Accounts</span>
              <strong>{accounts.length}</strong>
            </div>
            <div className="stat">
              <span className="muted">Transactions</span>
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

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Linked accounts</h2>
            {accounts.length > 0 ? (
              <span className="muted">{accounts.length} connected</span>
            ) : null}
          </div>

          {accounts.length === 0 ? (
            <div className="empty">
              <p className="muted" style={{ margin: 0 }}>
                No bank accounts yet. Link a bank to pull balances and transactions into
                MoneyMap.
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
                      {[account.type, `${account._count.transactions} tx`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="account-balances">
                    <strong>{formatMoney(account.balance, account.currency)}</strong>
                    <span className="muted">
                      Available {formatMoney(account.availableBalance, account.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {recentTransactions.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Recent transactions</h2>
              <span className="muted">Last {recentTransactions.length}</span>
            </div>
            <ul className="tx-list">
              {recentTransactions.map((tx) => {
                const amount = Number(tx.amount.toString());
                const signed =
                  tx.direction === "debit" ? -Math.abs(amount) : Math.abs(amount);
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
          </section>
        ) : null}
      </main>
    </div>
  );
}
