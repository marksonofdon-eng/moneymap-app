/**
 * Admin email allowlist from ADMIN_EMAILS (comma-separated).
 * Production fails closed when the env var is missing/empty.
 * Development allows any signed-in user when unset.
 */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const allowlist = getAdminEmails();
  if (allowlist.length === 0) {
    return process.env.NODE_ENV !== "production";
  }
  return allowlist.includes(email.trim().toLowerCase());
}

export function isAdminGateConfigured(): boolean {
  return getAdminEmails().length > 0;
}
