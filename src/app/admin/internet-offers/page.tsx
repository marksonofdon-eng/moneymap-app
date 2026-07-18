import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail, isAdminGateConfigured } from "@/lib/admin";
import { AppClientActions } from "@/app/app/AppClientActions";
import { AppHeader } from "@/components/AppHeader";
import { InternetOffersAdminClient } from "./InternetOffersAdminClient";

export default async function InternetOffersAdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/admin/internet-offers");
  }

  if (
    process.env.NODE_ENV === "production" &&
    !isAdminGateConfigured()
  ) {
    return (
      <div className="shell">
        <main className="main">
          <div className="panel">
            <h1 className="page-title">Admin unavailable</h1>
            <p className="muted">
              Set <code>ADMIN_EMAILS</code> to enable the admin console in production.
            </p>
            <Link href="/app">Back to dashboard</Link>
          </div>
        </main>
      </div>
    );
  }

  if (!isAdminEmail(user.email)) {
    return (
      <div className="shell">
        <AppHeader>
          <AppClientActions mode="logout" />
        </AppHeader>
        <main className="main">
          <div className="panel">
            <h1 className="page-title">Access denied</h1>
            <p className="muted">
              Your account is not on the admin allowlist for this tool.
            </p>
            <Link href="/app">Back to dashboard</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <AppHeader>
        <Link href="/app">Dashboard</Link>
        <Link href="/admin/internet-bills">Detected bills</Link>
        <Link href="/admin/internet-offers" aria-current="page">
          Internet offers
        </Link>
        <AppClientActions mode="logout" />
      </AppHeader>
      <main className="main admin-main">
        <div className="panel admin-panel">
          <InternetOffersAdminClient userEmail={user.email} />
        </div>
      </main>
    </div>
  );
}
