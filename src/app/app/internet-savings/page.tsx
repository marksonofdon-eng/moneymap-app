import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { AppClientActions } from "@/app/app/AppClientActions";
import { InternetSavingsClient } from "./InternetSavingsClient";

export default async function InternetSavingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/internet-savings");

  return (
    <div className="shell">
      <AppHeader>
        <Link href="/app">Home</Link>
        <Link href="/app/internet-savings" aria-current="page">
          Internet Savings
        </Link>
        <AppClientActions mode="logout" />
      </AppHeader>
      <main className="main">
        <div className="panel">
          <InternetSavingsClient />
        </div>
      </main>
    </div>
  );
}
