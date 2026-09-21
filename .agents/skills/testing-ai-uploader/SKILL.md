---
name: testing-ai-uploader
description: How to E2E-test the ai_uploader Cloudflare Workers app locally — including a local Supabase Auth stub that enables real logged-in browser sessions without Discord OAuth.
---

# Testing ai_uploader locally (E2E)

## Stack / services

- `npm run build:web` first (Workers serves `web/dist`; stale assets otherwise).
- `npm run dev:api` → `wrangler dev` on http://localhost:8787 (local D1 + R2 + Durable Object all simulated).
- `npx wrangler d1 execute ai_uploader_db --local --file=<abs path>.sql` — relative `--file` paths can fail; use absolute. `ensureTables()` also auto-creates schema at runtime, so seeding optional.

## Authenticated testing without real Supabase (local stub)

`fetchSupabaseUser` calls `${SUPABASE_URL}/auth/v1/user` with the Bearer/cookie token. Point it at a local stub in `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:8788
SUPABASE_ANON_KEY=dummy-anon-key
```

Stub server (see vitest.config.mts `outboundService` for the same pattern) must implement:
- `GET /auth/v1/user` → return `{id, email, user_metadata:{name}}` by Bearer token (e.g. `owner-token`→owner-user-1, `other-token`→other-user-2); 401 otherwise.
- `GET /auth/v1/authorize` → 302 to `redirect_to` + `?code=x` + `#access_token=owner-token&token_type=bearer&expires_in=3600&refresh_token=x` (covers both PKCE and implicit callback paths).
- `POST /auth/v1/token` → `{access_token, token_type, expires_in, refresh_token, user}`.
- **CRITICAL: `OPTIONS *` → 204 with `access-control-allow-origin: *` + `access-control-allow-headers: *`, and add `access-control-allow-origin: *` to all JSON responses.** Supabase-js sends CORS preflights; without this the browser login silently fails and lands on `/?login=1`.

Then the REAL login flow works in the browser: click ログイン → `/auth/config` → supabase-js → stub authorize → `/auth/callback` → `POST /auth/session` sets `sb-access-token` cookie → logged in.

For curl, `Authorization: Bearer owner-token` also works and is exempt from the CSRF `sec-fetch-site` check (cookie auth is not — cross-site POSTs 403).

## Quirks to know

- `GET /` is served by the **assets router directly** (index.html): 200 static landing page, no worker → no security headers and no auth gate on `/`. Protected pages (/items, /upload, /items/:id, /u/:name) DO gate with 401 login-required HTML.
- `/index.html` and unknown HTML paths redirect (307) to `/`.
- Installing `fonts-noto-cjk` (needs `apt-get update` first on this box) makes Japanese UI text readable in screenshots/recordings — otherwise it renders as tofu boxes.
- Native file picker: `dropZone` click → GTK dialog → `Ctrl+L` → type absolute path → Enter. Japanese text cannot be typed via xdotool — use ASCII test strings.
- The upload form's submit-button click can be flaky under automation; pressing **Enter inside the title input** triggers implicit submission reliably (still exercises the same upload.js handler).
- `pageSize` on /items is 20 — need >21 matching items to see the pager. Seed via D1 inserts.
- viewCount increments via `ctx.waitUntil` after the response: first detail view shows 0, second shows 1, stays 1 (dedupe `view:{id}:{ip}` 1h).
- **Console `400`s on `/api/thumbnail?k=…` may be the computer-use `annotateDom` harness** re-fetching DOM-truncated URLs (literal `...` → `..` in `k` → the bad-key guard returns 400). Check the Initiator column: `VM…`/`annotateDom` = harness noise, `page:NN` = real element. Don't report as an app error.
- `/tmp` artifacts (e.g. the Supabase stub script) can be wiped between sessions/process restarts — recreate from this recipe if missing.
- Responsive checks: DevTools device toolbar via `Ctrl+Shift+M`.
- A broken-image icon on a thumbnail means the R2 object exists but is corrupt (check object bytes); truly missing objects get the 68-byte placeholder PNG.
- `.dev.vars` is gitignored — never commit it (AGENTS.md rule).

## Devin Secrets Needed

None for local stub testing. Real OAuth would need SUPABASE_URL/SUPABASE_ANON_KEY of a live project (not available).
