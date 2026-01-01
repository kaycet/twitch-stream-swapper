## Token broker security (Cloudflare)

The token broker is public-by-definition (it sits on the Internet), so the goal is:
- **Minimize what an attacker can get** (don’t expose raw tokens).
- **Constrain who can use it** (origins + Cloudflare rules).
- **Limit abuse** (rate limiting + bot/WAF protections).

### 1) Use the safer endpoint shape

Prefer using **`/helix/*` only**. This proxies Twitch Helix and keeps the access token server-side.

- The Worker ships with **`GET /token` disabled by default** (recommended).
- Only enable `/token` for debugging by setting `ENABLE_TOKEN_ENDPOINT="1"` (not recommended for production).
- The Worker also enforces **GET/HEAD only** (non-GET methods return 405).

### 2) Configure Worker secrets + allowlist

In Cloudflare → Workers & Pages → your Worker → **Settings**:

- **Secrets**:
  - `TWITCH_CLIENT_ID`
  - `TWITCH_CLIENT_SECRET`
- **Variables**:
  - `ALLOWED_ORIGINS` = `chrome-extension://<your-extension-id>`

Notes:
- `ALLOWED_ORIGINS` supports comma-separated values.
- Keep it exact; no wildcards.
- Some Chrome extension contexts may omit the `Origin` header; the broker falls back to the `Referer` origin for allowlisting in that case.

### 3) Put it behind a custom domain (recommended)

Cloudflare dashboard steps (high level):

- Add your domain to Cloudflare (zone) and switch DNS to Cloudflare.
- Create a DNS record like:
  - `token.yourdomain.com` → proxied (orange cloud ON)
- Workers & Pages → your Worker → **Triggers / Routes**:
  - Route: `token.yourdomain.com/*` → your Worker

You can also configure routes via `wrangler.toml` (see comments in `token-broker/wrangler.toml`).

### 4) Cloudflare WAF “lock it down” rules

In Cloudflare → Security → WAF (or Security Rules), create rules like:

- **Allow only the paths you need**:
  - Allow if URI path starts with `/helix/`
  - (Optional) allow `/token` only if you temporarily enable it
  - Block everything else

- **Allow only safe methods**:
  - Allow `GET`, `HEAD`, `OPTIONS`
  - Block everything else

This dramatically reduces the attack surface.

### 5) Rate limiting (best bot/abuse control here)

In Cloudflare → Security → WAF → **Rate limiting rules** (or “Rate limiting” section):

- **Scope**: `token.yourdomain.com`
- **Match**: URI path starts with `/helix/`
- **Limit**: start conservative (example)
  - `60` requests per `60` seconds per IP
  - block for `10` minutes

Tune based on your real polling interval and user base.

### 6) Bot protection settings

In Cloudflare → Security → Bots:

- Turn on **Bot Fight Mode** (or **Super Bot Fight Mode** if your plan supports it).
- Consider raising **Security Level** to “Medium” or “High” for this subdomain.

Avoid interactive challenges (Turnstile / JS challenges) on `/helix/*` because a Chrome extension fetch will not handle them gracefully.

### 7) Observability / incident response

- Enable Cloudflare analytics/logging for the Worker route.
- Watch for:
  - spikes in requests
  - lots of 403s (origin mismatch)
  - lots of 429s (rate limiting)

### Reality check

Because a Chrome extension is a public client, you cannot fully prevent determined abuse (attackers can mimic requests).
Your best defenses are:
- **don’t expose raw tokens**
- **rate limit**
- **WAF rule constraints**


