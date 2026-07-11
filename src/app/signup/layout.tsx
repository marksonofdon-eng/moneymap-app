import { Suspense } from "react";

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="auth-wrap">
          <div className="card muted">Loading…</div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
