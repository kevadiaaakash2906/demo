// Cloudflare Pages Function: POST /api/track
// Body: { numbers: ["1Z...", "1Z..."] }  Header: Authorization: Bearer <Firebase ID token>
//
// Secrets (Pages project > Settings > Variables and Secrets):
//   UPS_CLIENT_ID, UPS_CLIENT_SECRET, FIREBASE_API_KEY

const UPS = 'https://onlinetools.ups.com';
const MAX_NUMBERS = 25;
const CONCURRENCY = 5;
const NUMBER_RE = /^[0-9A-Z]{8,26}$/;

// Token cache lives as long as the isolate does; a cold start just fetches a new one.
let tokenCache = { value: null, exp: 0 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function verifyFirebaseUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!idToken) return false;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  return res.ok;
}

async function getUpsToken(env) {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  const res = await fetch(`${UPS}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${env.UPS_CLIENT_ID}:${env.UPS_CLIENT_SECRET}`),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`UPS auth failed (${res.status})`);
  const j = await res.json();
  tokenCache = {
    value: j.access_token,
    exp: Date.now() + (Number(j.expires_in || 3600) - 300) * 1000,
  };
  return tokenCache.value;
}

const fmtDate = (d) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '');
const fmtTime = (t) => (t && t.length >= 4 ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : '');

function normalize(number, data) {
  const shipment = data?.trackResponse?.shipment?.[0];
  const pkg = shipment?.package?.[0];
  if (!pkg) {
    const msg =
      shipment?.warnings?.[0]?.message ||
      data?.response?.errors?.[0]?.message ||
      'No tracking information found';
    return { number, ok: false, error: msg };
  }

  const events = (pkg.activity || []).map((a) => ({
    status: a.status?.description || '',
    type: a.status?.type || '',
    location: [a.location?.address?.city, a.location?.address?.stateProvince, a.location?.address?.country]
      .filter(Boolean)
      .join(', '),
    date: fmtDate(a.date),
    time: fmtTime(a.time),
  }));

  const latest = events[0] || {};
  // UPS status types: D delivered, O out for delivery, I in transit, X exception,
  // M label created, P picked up, RS returned to sender
  const type = latest.type || '';
  const state =
    type === 'D' ? 'delivered' :
    type === 'O' ? 'out' :
    type === 'X' ? 'exception' :
    type === 'M' ? 'created' :
    type === 'RS' ? 'exception' : 'transit';

  return {
    number,
    ok: true,
    state,
    status: pkg.currentStatus?.description || latest.status || 'In progress',
    location: latest.location || '',
    date: latest.date || '',
    time: latest.time || '',
    eta: fmtDate(pkg.deliveryDate?.[0]?.date) || '',
    events,
  };
}

async function trackOne(number, token) {
  try {
    const res = await fetch(
      `${UPS}/api/track/v1/details/${encodeURIComponent(number)}?locale=en_US&returnSignature=false`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          transId: crypto.randomUUID(),
          transactionSrc: 'parcel-tracker',
        },
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data?.trackResponse) {
      const msg = data?.response?.errors?.[0]?.message || `UPS returned ${res.status}`;
      return { number, ok: false, error: msg };
    }
    return normalize(number, data);
  } catch (e) {
    return { number, ok: false, error: 'Could not reach UPS' };
  }
}

// Runs tasks with a small concurrency limit.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyFirebaseUser(request, env))) return json({ error: 'Sign in again' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  const numbers = [...new Set((body.numbers || []).map((n) => String(n).trim().toUpperCase()))]
    .filter((n) => NUMBER_RE.test(n))
    .slice(0, MAX_NUMBERS);
  if (!numbers.length) return json({ error: 'No valid tracking numbers' }, 400);

  let token;
  try { token = await getUpsToken(env); } catch (e) { return json({ error: e.message }, 502); }

  const results = await pool(numbers, CONCURRENCY, (n) => trackOne(n, token));
  return json({ results });
}
