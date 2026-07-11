/**
 * Frontend-free Basiq connectivity + optional sandbox user create.
 * Usage: node --env-file=.env scripts/test-basiq-connection.mjs
 */
import 'dotenv/config';

const BASIQ_VERSION = process.env.BASIQ_VERSION || '3.0';
const BASIQ_BASE_URL = 'https://au-api.basiq.io';
const apiKey = process.env.BASIQ_API_KEY;

if (!apiKey) {
  console.error('BASIQ_API_KEY missing in .env');
  process.exit(1);
}

async function getServerToken() {
  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'basiq-version': BASIQ_VERSION,
    },
    body: 'scope=SERVER_ACCESS',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`token failed ${res.status}: ${text}`);
  }
  const json = JSON.parse(text);
  return json.access_token || json.accessToken;
}

async function createSandboxUser(accessToken) {
  const res = await fetch(`${BASIQ_BASE_URL}/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'basiq-version': BASIQ_VERSION,
    },
    body: JSON.stringify({
      email: `sandbox+${Date.now()}@moneymap.local`,
      mobile: '+61490000000',
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`createUser failed ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function getClientToken(accessToken, userId) {
  // CLIENT_ACCESS requires Basic API key + userId form field
  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'basiq-version': BASIQ_VERSION,
    },
    body: `scope=CLIENT_ACCESS&userId=${encodeURIComponent(userId)}`,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`client token failed ${res.status}: ${text}`);
  }
  const json = JSON.parse(text);
  return json.access_token || json.accessToken;
}

const serverToken = await getServerToken();
console.log('Basiq SERVER_ACCESS: OK');

const user = await createSandboxUser(serverToken);
console.log('Basiq sandbox user:', user.id);

const clientToken = await getClientToken(serverToken, user.id);
const consentUrl = `https://consent.basiq.io/home?token=${clientToken}`;
console.log('Consent URL ready (open to link sandbox bank):');
console.log(consentUrl);
console.log('');
console.log('In Basiq dashboard → Consent UI → Redirect URL, paste EXACTLY this (no query string):');
console.log('http://localhost:3001/callback');
console.log('(Basiq will append ?jobId=...&userId=... itself after consent.)');
