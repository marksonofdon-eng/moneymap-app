import type { ReactNode } from "react";
import { MoneyMapLogo } from "./MoneyMapLogo";

type AppHeaderProps = {
  children?: ReactNode;
  homeHref?: string;
};

/**
 * Shared app chrome header — MoneyMap V2 brand mark + page actions.
 * Intentionally omits marketing links (Pricing, Savings Alerts, etc.).
 */
export function AppHeader({ children, homeHref = "/app" }: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <MoneyMapLogo href={homeHref} />
        {children ? <nav className="admin-nav">{children}</nav> : null}
      </div>
    </header>
  );
}
