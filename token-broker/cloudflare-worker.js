/**
 * Twitch App Access Token Broker (Cloudflare Worker)
 *
 * Purpose:
 * - Keep Twitch Client Secret OFF the Chrome extension.
 * - Provide App Access Tokens to the extension for Helix requests.
 *
 * Endpoints:
 * - GET /token  -> { access_token, expires_in }
 * - /helix/*    -> Proxies Twitch Helix API (recommended for production)
 *
 * Required secrets (Cloudflare):
 * - TWITCH_CLIENT_ID
 * - TWITCH_CLIENT_SECRET
 *
 * Optional environment variables:
 * - ALLOWED_ORIGINS (comma-separated), e.g. "chrome-extension://<your-extension-id>"
 */

let cachedToken = null;
let cachedExpiresAt = 0;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // If no allowlist is set, allow all origins (not recommended).
  const allowOrigin = allowed.length === 0
    ? '*'
    : (allowed.includes(origin) ? origin : '');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function getAppToken(env) {
  const now = Date.now();
  if (cachedToken && now < cachedExpiresAt - 60_000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });

  const resp = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  cachedToken = data.access_token;
  cachedExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

async function proxyHelix(request, env) {
  const url = new URL(request.url);
  // /helix/... -> https://api.twitch.tv/helix/...
  const upstreamUrl = new URL(`https://api.twitch.tv${url.pathname.replace(/^\/helix/, '/helix')}${url.search}`);

  const token = await getAppToken(env);

  const headers = new Headers(request.headers);
  // Ensure correct auth for Helix
  headers.set('Client-ID', env.TWITCH_CLIENT_ID);
  headers.set('Authorization', `Bearer ${token}`);
  // Avoid leaking extension Origin to Twitch
  headers.delete('Origin');
  // Keep Accept sane
  if (!headers.get('Accept')) headers.set('Accept', 'application/json');

  const init = {
    method: request.method,
    headers,
  };

  // Only forward body for non-GET/HEAD
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  const resp = await fetch(upstreamUrl.toString(), init);

  // Return response as-is, but add CORS for extension
  const outHeaders = new Headers(resp.headers);
  const cors = corsHeaders(request, env);
  Object.entries(cors).forEach(([k, v]) => outHeaders.set(k, v));

  return new Response(resp.body, { status: resp.status, headers: outHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // Proxy Helix (recommended production path)
    if (url.pathname.startsWith('/helix/')) {
      try {
        return await proxyHelix(request, env);
      } catch (err) {
        return new Response(JSON.stringify({ error: 'helix_proxy_error', message: String(err?.message || err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
        });
      }
    }

    // Optional token endpoint (debug only)
    if (url.pathname !== '/token') {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
      });
    }

    // Basic allowlist enforcement
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(origin)) {
      return new Response(JSON.stringify({
        error: 'forbidden_origin',
        origin,
        hint: 'Origin must exactly match one of ALLOWED_ORIGINS. For extensions it is chrome-extension://<extension-id>.',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
      });
    }

    try {
      const token = await getAppToken(env);
      // We do not expose the raw expiry time, only expires_in
      const expiresIn = Math.max(0, Math.floor((cachedExpiresAt - Date.now()) / 1000));

      return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request, env),
          // Cache at edge briefly; token itself is cached in memory above
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'token_broker_error', message: String(err?.message || err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
      });
    }
  },
};


