# Companion session service

Local and deployable Cloudflare Worker for a private Companion Mode test. It stores one session per game and forwards public timer snapshots to connected companions.

The public timer does not open a session. Companion Mode is not on the timer page. Nothing in this repository deploys the worker for you.

Figures below are from Cloudflare's docs as checked on 12 October 2026. The Durable Objects pricing page was last updated on 30 September 2026. The Workers Rate Limiting page was updated on 12 October 2026. Re-check those pages before a later deploy.

## Free plan

The worker is built for the Workers Free plan.

- SQLite-backed Durable Objects are included. Key-value Durable Objects are not, and this project does not use them.
- `workers.dev` is included. A custom domain is not required for the first test. Cloudflare describes `workers.dev` as suitable for personal projects, not as the long-term production hostname.
- WebSocket hibernation is included. This worker uses `acceptWebSocket`, not `accept()`, and it does not keep a `setInterval` inside the Durable Object. Idle sockets can hibernate. Duration is charged only while the object is actually running. On the free plan, going past the included amount fails the operation. It does not add a charge.
- No KV, R2, Queues, Analytics Engine, or paid WAF product is configured.
- Do not set a custom CPU limit. Raising CPU time is a paid-plan control. The free plan allows 10 milliseconds of CPU per worker invocation. These handlers only hash a token, read or write a few SQL rows, and forward a small JSON message.

Included free amounts, which reset at 00:00 UTC and then fail rather than bill:

| Meter | Included |
| --- | --- |
| Worker requests | 100,000 / day |
| Durable Object requests | 100,000 / day |
| Durable Object duration | 13,000 GB-s / day |
| SQLite rows read | 5 million / day |
| SQLite rows written | 100,000 / day |
| SQLite stored data | 5 GB total, and 1 GB per object |

A WebSocket connection counts as one request. Incoming WebSocket messages are billed at 20 messages to one request. Outgoing messages are not billed. `setAlarm()` counts as one row write.

### A three-hour game with about 20 companions

One Storyteller publish or heartbeat about every 10 seconds is roughly 1,100 publishes. Each is a handful of row writes and a short wake of the session object. Twenty companions connect once, receive those snapshots, and may reconnect a few times. That is on the order of a few thousand row writes, well under 100,000, and a few GB-s of duration, well under 13,000. Outgoing fan-out is not billed as messages.

This assumes the object hibernates between messages. A clock ping has to wake the object, because the worker clock is read in the handler. Those wakes are short. Do not switch the clock ping to an automatic WebSocket response: that response would not carry a fresh `serverTime`.

### What can cost money

Staying on the Workers Free plan should not create a bill. The ways to leave that plan are choosing Workers Paid, adding a paid product such as WAF rate-limiting rules that need a higher plan, or attaching a custom domain on a zone that is itself a paid plan. This configuration does none of those.

Exceeding a free quota stops the operation with an error. It does not silently upgrade the account.

## Run it locally

From the repository root, in two terminals:

```bash
npm run dev:worker
npm run dev:timer
```

Wrangler serves the worker on `http://127.0.0.1:8787`. The timer server serves the page on `http://127.0.0.1:8006` and proxies `/companion-api` to the worker. The browser stays on one origin, so the production Content Security Policy does not change. Do not pass `--remote`. Do not run `wrangler login` or `wrangler deploy` for local work.

Open `http://127.0.0.1:8006/?companionDev=1`. The panel says **Local worker**. Start sharing, then use Open companion for a second window. The write token stays in the Storyteller page's memory. The companion window only receives the session code.

`npm run dev:timer` is the local page server. Do not use `npm run dev`. GitHub Pages has no `/companion-api` proxy, so the public site cannot reach a worker on your machine.

`GET /health` returns `{ "ok": true }` with no Origin check, so a wait script can use it. `HEAD /health` does the same.

## Wrangler configuration

`worker/wrangler.jsonc` is the only config.

- Worker name: `clocktower-companion`
- Compatibility date: `2026-10-12`
- `workers_dev`: true, so the first deploy is `https://clocktower-companion.<account>.workers.dev`
- No `account_id`, no API token, and no route on a custom domain
- Both Durable Object classes use the existing `v1` migration with `new_sqlite_classes`
- Do not edit the `v1` migration after the first successful deploy. A later class change needs a new migration tag. Editing `v1` does not migrate an existing account.

There is one environment. A second Wrangler environment would have to repeat the Durable Object bindings, which is easy to get wrong, so local and deployed use the same file. Local `wrangler dev` does not publish it.

`.gitignore` ignores `.wrangler/`, `worker/.wrangler/`, and `.dev.vars`. Do not commit those. This worker has no production secrets.

## Deploy

Do this yourself, from the repository root, after you have read the free-plan section.

1. Install nothing extra. Wrangler is already a dev dependency.
2. Log in and pick the free account when the browser asks:

   ```bash
   npx wrangler login
   ```

3. Confirm the account Wrangler will use. The email and account name should be the free account you created. If more than one account is listed, stop and select the free one in the browser flow again. Do not copy an account id into the config.

   ```bash
   npx wrangler whoami
   ```

4. Check the config without deploying:

   ```bash
   npx wrangler deploy --config worker/wrangler.jsonc --dry-run
   ```

   The dry run should name `clocktower-companion`, both SQLite classes, and `workers.dev`. It should not mention KV, R2, or a custom domain.

5. Deploy:

   ```bash
   npx wrangler deploy --config worker/wrangler.jsonc
   ```

   The first deploy applies the `v1` migration and creates the two SQLite classes. Wrangler prints the URL. It looks like:

   ```text
   https://clocktower-companion.<your-subdomain>.workers.dev
   ```

   Write that origin down. It is not a secret, but it is account-specific, so it is not committed in this repo.

6. Check the worker. This does not create a session:

   ```bash
   curl -sS -D - https://clocktower-companion.<your-subdomain>.workers.dev/health
   ```

   Expect HTTP 200 and `{"ok":true}`.

7. Run the disposable session script. It keeps the write token in memory and does not print it. Use the timer origin so the worker's allowlist accepts the call:

   ```bash
   COMPANION_WORKER_URL='https://clocktower-companion.<your-subdomain>.workers.dev' \
   COMPANION_ORIGIN='https://timer.arcane-scripts.net' \
   node scripts/companion-smoke.mjs
   ```

   Expect a session code, `Published revision 1`, and `Session ended`. If you see `origin-rejected`, the origin you sent is not in `ALLOWED_ORIGINS`. If you see `create-rate`, that address already created 10 sessions this minute.

8. In the Cloudflare dashboard, open Workers & Pages, then this worker, then Metrics. You should see a small number of requests. Durable Objects should show the SQLite classes. There should be no KV namespace and no paid add-on.

9. Billing, in the same account, should still show the Workers Free plan. This deploy does not subscribe you to Workers Paid. If the dashboard offers a paid upgrade, do not accept it.

## Two browser windows against the deployed worker

Leave the public site alone. Point only the local timer server at the deployed origin:

```bash
COMPANION_WORKER_URL='https://clocktower-companion.<your-subdomain>.workers.dev' \
npm run dev:timer
```

Open `http://127.0.0.1:8006/?companionDev=1`. The panel is red-tinted and says **Remote worker** plus the hostname. It must not say Local worker. Start sharing, open the companion, and exercise pause, resume, acceleration, a dropped connection, and End session.

The browser still talks to `http://127.0.0.1:8006/companion-api`. The dev server proxies that to the deployed worker and forwards the page's `Origin`. The production Content Security Policy is unchanged. Do not put the worker URL in the page query string. The URL belongs in the environment variable so a link cannot redirect the write token.

The proxy answers a refused upgrade with that HTTP status and then closes the socket, so the browser leaves `CONNECTING` and shows a failed handshake. It does not forward Cloudflare's `alt-svc` header onto the local page.

`npm run dev:worker` is not required for this remote test. If it is running, the page still uses `COMPANION_WORKER_URL` and not the local worker.

## Origin policy

`ALLOWED_ORIGINS` is an exact comma-separated list:

- `https://timer.arcane-scripts.net`
- `http://localhost:8006`
- `http://127.0.0.1:8006`

There is no wildcard. `POST /sessions` and every WebSocket upgrade must send one of these `Origin` values. Anything else gets `403` `origin-rejected` and does not touch the directory. The response does not use `Access-Control-Allow-Origin: *`. A request with an allowed origin receives that origin back, plus `Vary: Origin`.

`OPTIONS /sessions` answers a preflight with `204`, `Access-Control-Allow-Methods: POST, OPTIONS`, and `Access-Control-Allow-Headers: Content-Type`. Credentials are not allowed. The write token is not a cookie.

WebSocket upgrades are not covered by CORS. The worker checks `Origin` on the upgrade itself. Storyteller and companion sockets use the same allowlist, because both pages are served from the timer origin. A random website cannot open either socket from a browser.

A script can set `Origin` itself. That is not authentication. The write token is what lets a socket publish. Treat the allowlist as protection against other web pages, not against someone who can run curl.

`/health` does not check `Origin`.

The public timer's Content Security Policy stays `connect-src 'self'` plus the existing analytics and YouTube hosts. Do not add the worker there until a real sharing control exists. When that happens, the page will also need the worker origin on `connect-src`, for example:

```text
connect-src 'self' https://clocktower-companion.<your-subdomain>.workers.dev wss://clocktower-companion.<your-subdomain>.workers.dev
```

Use the real hostname from the deploy output. Do not add `*` or `localhost` to the production policy.

## Rate limiting

Two Workers Rate Limiting bindings are in the Wrangler config. They do not require a paid WAF plan. They are not a dashboard rule, so there is nothing to click into place after deploy. `wrangler deploy` publishes them.

| Binding | Limit | What it counts |
| --- | --- | --- |
| `CREATE_BUDGET` | 10 per 60 seconds | `POST /sessions` for one `CF-Connecting-IP` |
| `GUESS_BUDGET` | 60 per 60 seconds | WebSocket joins for one `CF-Connecting-IP`, including joins that succeed |

Counters are per Cloudflare location, and they are eventually consistent. They are not a global exact total. The key is `CF-Connecting-IP`, which Cloudflare sets at the edge. The worker ignores any address the client types into another header. Calls with no platform address, which is the case in the local test runner, are not piled into one bucket.

WAF rate limiting on the Free plan cannot count by IP. Its one free rule can match path and verified bot, over 10 seconds. That would not stop code guessing, so it is not used. Do not add a WAF rate-limiting rule unless you have confirmed it is still free. A paid rule is unnecessary for this test.

The directory still refuses more than 120 session creates per minute for the whole worker. One address cannot spend that budget, because of the 10-per-minute address cap. A spread of addresses, or many real tables at once, can still reach 120 and then everyone gets `create-limit` until the minute passes. That is the remaining shared-budget risk. Do not remove the global cap. It is what stops one location's rate-limit window from being multiplied across every Cloudflare location.

Six Crockford characters is about a billion codes. Sixty guesses a minute from one location cannot search that space. A distributed flood is also capped by the free plan's 100,000 requests per day, after which Cloudflare fails the request instead of billing.

## Session directory

`SessionDirectory` is one SQLite object, `idFromName('companion-sessions')`. It is the only code index. `CompanionSession` is a second SQLite class, one object per internal id.

- Codes come from `crypto.getRandomValues`. Each byte is masked to the 32-character alphabet, which is uniform.
- Reserve is a read then an insert with no `await` between them, on a Durable Object that runs one request at a time. Two creates cannot take the same code.
- A row is retired in place. Lookup only returns `active` rows. A retired code is never inserted again, so it cannot point at a later session.
- There is no list of sessions. `GET /sessions` is 404. A well-formed code without a WebSocket upgrade is 426 and does not look the code up.
- A failed join does not call `idFromName` and does not create a session object.
- End, idle expiry, and the 12-hour cap all clear the token hash, delete the snapshot, retire the directory row, and delete the alarm. Retire matches code and session id, and only an `active` row, so a repeated cleanup cannot retire a different live session.
- After the object is evicted, the constructor arms the earliest remaining alarm again.

Retired rows are kept. At this size a row is a few dozen bytes. A year of ordinary games is negligible next to 5 GB. A hostile client is limited to 120 creates a minute, and those rows are the cost of never reissuing a code. Do not delete them to save space.

When a session ends, `token_hash` is set to an empty string and `status` becomes `closed`. A later auth with the old token fails. The token was only in the Storyteller page's memory, and that page drops it when the session ends, when sharing stops, or when the server reports expiry or replacement.

## Sockets

The Storyteller's first message is `{ "type": "auth", "token": "..." }`. The token must not be in the URL. Readers cannot auth or publish. A second successful auth closes the previous Storyteller socket with `replaced`. That socket does not reconnect and fight for the session.

Unauthenticated Storyteller sockets have their own deadlines. One alarm is the earliest of those deadlines, the three-hour idle time, and the twelve-hour cap. Closing one socket does not cancel the others. The alarm is rescheduled afterwards.

Messages over 2048 bytes are refused. Invalid JSON and unknown types get an error and no acknowledgement. Thirty accepted publishes per 10 seconds are stored. An older `capturedAt` is `stale-publish` and does not advance the revision. After a snapshot is stored, only that Storyteller socket receives `{ "type": "published", "rev", "serverTime" }`.

`capturedAt` is the Storyteller's `Date.now()` in the same turn as the timer sample, after capture returns and before any network wait. It is not inside the public v1 object. `upstreamOffsetMs` is that page's estimate of worker clock minus its own clock. The anchor is `capturedAt + upstreamOffsetMs` when both exist. Until the first good ping, the anchor is the worker's receipt time, which is later than the capture.

The ping offset is the worker time minus the local time at the middle of the round trip. An even trip recovers a steady clock difference. An uneven trip is wrong by about half the difference between the two directions. A 20ms send and a 180ms reply is about 80ms out. That is the estimate this milestone uses. It is not a guarantee.

Samples over 500ms, or slower than twice the best after three samples, are dropped. A correction under 150ms moves halfway. The companion then advances the estimate with `performance.now()` and calls `readCompanionCountdown()`. A local zero is not a new phase. A snapshot is stale 25 seconds after receipt on that monotonic clock. A paused countdown stays fresh while snapshots arrive.

## Rollback

A later deploy replaces the script and keeps Durable Object storage, including live sessions and retired codes. Existing sessions keep working if the new script still understands the same tables.

To return to the previous script without deleting data:

```bash
npx wrangler deployments list --config worker/wrangler.jsonc
npx wrangler rollback --config worker/wrangler.jsonc
```

Confirm the deployment id from the list before you roll back. Rollback does not unsubscribe the account from anything, because this deploy did not add a subscription.

To stop traffic and keep the data, redeploy is the wrong tool. In the dashboard, open the worker and disable the `workers.dev` route. Browsers then cannot reach it. The Durable Object data remains until you delete the worker.

Deleting the worker in the dashboard, or `npx wrangler delete --config worker/wrangler.jsonc`, removes the script. Do that only when you mean to discard the test. Read the confirmation carefully. Do not delete the account.

## Logs

```bash
npx wrangler tail --config worker/wrangler.jsonc
```

The worker does not log write tokens, session codes, or snapshot bodies. `tail` shows request paths. A path contains the session code, so treat the log as private and stop tail when you are finished. Do not paste a `tail` transcript that includes `/sessions/<code>` into a public place.

## Tests

```bash
npm run test:worker
npm run test:unit
npm test
npm run test:integration
```

`npm run test:worker` runs inside the local Workers runtime. It does not use your Cloudflare account.

`npm run test:integration` starts that local worker and the timer server, then runs the Cypress spec in `cypress/integration/`. It does not use the deployed worker.

`npm test` is the normal Cypress suite against `serve`. It does not start a worker, and it checks that the public page neither shows the dev panel nor calls `/companion-api` or `workers.dev`.

Node tests use fake clocks and fake sockets.

## Protocol reminder

Create a session with `POST /sessions` and an allowed `Origin`. The body is `{ "code", "writeToken" }`. The token is shown once, in that response. Only its SHA-256 is stored.

Companion socket: `wss://<worker>/sessions/CODE`

Storyteller socket: `wss://<worker>/sessions/CODE/storyteller`

First Storyteller message:

```json
{ "type": "auth", "token": "WRITE_TOKEN" }
```

Publish:

```json
{
  "type": "publish",
  "state": {
    "v": 1,
    "phase": "day",
    "day": 1,
    "counts": {
      "townsfolk": 7,
      "outsider": 0,
      "minion": 2,
      "demon": 1,
      "traveller": 0
    },
    "timer": {
      "status": "running",
      "kind": "day",
      "remainingMs": 120000,
      "rate": 1
    }
  },
  "capturedAt": 1790000000000,
  "upstreamOffsetMs": 12
}
```

End with `{ "type": "end" }`.

Ping with `{ "type": "ping", "id": "sample-1" }`. The reply is `{ "type": "pong", "id": "sample-1", "serverTime": 1790000000100 }`. An unauthenticated Storyteller socket cannot ping.
