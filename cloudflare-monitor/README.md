# Cloudflare minute monitor

Cloudflare Worker that checks Manticore Search public services every minute and dispatches the normal Upptime workflow after a confirmed state transition.

## Behavior

- Runs every minute through a Cloudflare Cron Trigger.
- Runs at most six outbound requests concurrently.
- Retries a failed request once after 1.5 seconds.
- Requires two consecutive failures before declaring a service down.
- Requires two consecutive successes before recovery.
- Checks public pages every minute and functional search transactions every five minutes.
- Stores stable state, streaks, and a last-run heartbeat in D1.
- Exposes `/ready`, which fails if the cron heartbeat is more than three minutes old.
- Sends `repository_dispatch` with `event_type: uptime` only after confirmed state transitions.
- Keeps failed GitHub dispatches in an outbox flag and retries them on the next invocation.

## Local verification

```bash
npm install
npm run check
npm test
npm run db:migrate:local
npm run dev
```

Trigger the scheduled handler in another terminal:

```bash
curl -fsS http://localhost:8787/cdn-cgi/handler/scheduled
curl -fsS http://localhost:8787/health | jq
```

Local runs do not dispatch GitHub because `GITHUB_TOKEN` is absent.

## First deployment

Authenticate Wrangler:

```bash
npx wrangler login
```

Create D1 and copy its returned `database_id` into `wrangler.jsonc`:

```bash
npx wrangler d1 create manticore-upptime-monitor
```

Apply the schema:

```bash
npm run db:migrate:remote
```

Add the required GitHub secret. Prefer a fine-grained token restricted to `manticoresoftware/upptime` with the minimum repository permission needed to create `repository_dispatch` events:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Optionally enable authenticated manual runs with a separately generated token:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Do not commit either value or pass it as a Wrangler variable; both must remain encrypted Worker secrets.

Deploy and verify:

```bash
npm run deploy
npx wrangler tail
curl -fsS https://manticore-upptime-monitor.<workers-subdomain>.workers.dev/health | jq
```

Cron changes can take several minutes to propagate. Confirm at least two consecutive `monitor-run` log entries before relying on the Worker.

## HTTP endpoints

- `GET /health` — last heartbeat and stable service states; no secrets.
- `GET /ready` — `200` for a recent cron heartbeat, otherwise `503`; monitored by Upptime.
- `POST /run` — immediate run; requires `Authorization: Bearer $ADMIN_TOKEN`.

All other paths return `404`.

## Operational fallback

Keep Upptime's generated GitHub schedule enabled. It is a slower independent fallback if Cloudflare or the Worker stops running. Upptime also checks the Worker's `/ready` endpoint, which returns `503` when no cron run has completed for three minutes. Do not edit `.github/workflows/uptime.yml` directly; Upptime Setup CI regenerates it.
