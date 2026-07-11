"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** After Basiq redirect, ingest may still be running — refresh a few times. */
export function LinkedBanner() {
  const router = useRouter();
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    if (ticks >= 6) return;
    const id = window.setTimeout(() => {
      router.refresh();
      setTicks((t) => t + 1);
    }, 2500);
    return () => window.clearTimeout(id);
  }, [ticks, router]);

  return (
    <p className="banner">
      Bank link received. Syncing accounts and transactions
      {ticks < 6 ? "…" : " — refresh if nothing appears yet."}
    </p>
  );
}
