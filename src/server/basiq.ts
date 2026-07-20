const BASIQ_VERSION = process.env.BASIQ_VERSION || "3.0";
export const BASIQ_BASE_URL = "https://au-api.basiq.io";

function requireApiKey() {
  const apiKey = process.env.BASIQ_API_KEY;
  if (!apiKey) {
    throw new Error("BASIQ_API_KEY is required in .env");
  }
  return apiKey;
}

async function postToken(body: string) {
  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${requireApiKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "basiq-version": BASIQ_VERSION,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Basiq token failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as { access_token?: string; accessToken?: string };
  const token = json.access_token || json.accessToken;
  if (!token) throw new Error("Basiq token response missing access_token");
  return token;
}

export async function getServerAccessToken() {
  return postToken("scope=SERVER_ACCESS");
}

export async function getClientAccessToken(userId: string) {
  return postToken(`scope=CLIENT_ACCESS&userId=${encodeURIComponent(userId)}`);
}

export async function createBasiqUser(email: string, mobile = "+61490000000") {
  const accessToken = await getServerAccessToken();
  const res = await fetch(`${BASIQ_BASE_URL}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "basiq-version": BASIQ_VERSION,
    },
    body: JSON.stringify({ email, mobile }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Basiq createUser failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as { id: string; email?: string };
}

export async function getJob(jobId: string) {
  const accessToken = await getServerAccessToken();
  const res = await fetch(`${BASIQ_BASE_URL}/jobs/${jobId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "basiq-version": BASIQ_VERSION,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Basiq getJob failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

/** Basiq redirect only appends jobId — pull userId from job links/steps. */
export function extractUserIdFromJob(job: {
  links?: { source?: string };
  steps?: Array<{ result?: { url?: string } }>;
}): string | null {
  const urls = [
    job?.links?.source,
    ...(job?.steps || []).map((step) => step?.result?.url),
  ].filter(Boolean) as string[];

  for (const url of urls) {
    const match = String(url).match(/\/users\/([0-9a-f-]{36})/i);
    if (match) return match[1];
  }
  return null;
}

export async function resolveUserIdForJob(jobId: string): Promise<string> {
  const job = await getJob(jobId);
  const userId = extractUserIdFromJob(job);
  if (!userId) {
    throw new Error(`Could not resolve Basiq userId from job ${jobId}`);
  }
  return userId;
}

export async function getAccounts(userId: string) {
  const accessToken = await getServerAccessToken();
  const res = await fetch(`${BASIQ_BASE_URL}/users/${userId}/accounts`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "basiq-version": BASIQ_VERSION,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Basiq getAccounts failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

export async function basiqFetchJson(urlOrPath: string, accessToken: string) {
  const url = urlOrPath.startsWith("http")
    ? urlOrPath
    : `${BASIQ_BASE_URL}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "basiq-version": BASIQ_VERSION,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Basiq GET ${url} failed (${response.status}): ${body}`);
  }

  return response.json();
}

export type CreateIncomeSummaryOptions = {
  accounts?: string[];
  fromMonth?: string;
  toMonth?: string;
};

/**
 * Create a Basiq Income summary for a user.
 * POST /users/{userId}/income
 */
export async function createIncomeSummary(
  basiqUserId: string,
  opts?: CreateIncomeSummaryOptions,
) {
  const accessToken = await getServerAccessToken();
  const body: Record<string, unknown> = {};
  if (opts?.accounts?.length) body.accounts = opts.accounts;
  if (opts?.fromMonth) body.fromMonth = opts.fromMonth;
  if (opts?.toMonth) body.toMonth = opts.toMonth;

  const res = await fetch(`${BASIQ_BASE_URL}/users/${basiqUserId}/income`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "basiq-version": BASIQ_VERSION,
    },
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return null;
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Basiq createIncome failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** GET /users/{userId}/income/{incomeId} */
export async function getIncomeSummary(basiqUserId: string, incomeId: string) {
  const accessToken = await getServerAccessToken();
  return basiqFetchJson(
    `/users/${basiqUserId}/income/${incomeId}`,
    accessToken,
  ) as Promise<Record<string, unknown>>;
}

export function buildConsentBrowserLink(clientAccessToken: string) {
  return `https://consent.basiq.io/home?token=${clientAccessToken}`;
}
