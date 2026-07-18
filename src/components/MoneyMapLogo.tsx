import Link from "next/link";

type MoneyMapLogoProps = {
  href?: string;
  /** When false, renders a non-link lockup (e.g. auth cards). */
  asLink?: boolean;
};

export function MoneyMapLogo({ href = "/app", asLink = true }: MoneyMapLogoProps) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-mark-ring brand-mark-ring--outer" />
        <span className="brand-mark-ring brand-mark-ring--inner" />
      </span>
      <span className="brand-wordmark">
        Money<span>Map</span>
      </span>
    </>
  );

  if (!asLink) {
    return <div className="brand-lockup">{content}</div>;
  }

  return (
    <Link href={href} className="brand-lockup">
      {content}
    </Link>
  );
}
