import Link from "next/link";
import { redirect } from "next/navigation";
import { AppClientActions } from "@/app/app/AppClientActions";
import { AppHeader } from "@/components/AppHeader";
import { getAdminUser } from "@/server/admin/requireAdmin";
import { InternetBillsAdminClient } from "./InternetBillsAdminClient";

export default async function InternetBillsAdminPage() {
  const user = await getAdminUser();
  if (!user) {
    redirect("/login?next=/admin/internet-bills");
  }

  return (
    <div className="shell">
      <AppHeader>
        <Link href="/app">Dashboard</Link>
        <Link href="/admin/internet-bills" aria-current="page">
          Detected bills
        </Link>
        <Link href="/admin/internet-offers">Internet offers</Link>
        <AppClientActions mode="logout" />
      </AppHeader>
      <main className="main admin-main">
        <div className="panel admin-panel">
          <InternetBillsAdminClient />
        </div>
      </main>
    </div>
  );
}
