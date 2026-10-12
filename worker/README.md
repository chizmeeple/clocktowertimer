# Companion session service

Local Cloudflare Worker for Companion Mode. It stores one session per game and forwards public timer snapshots to connected companions. It is not deployed. The public timer does not open a session. A localhost page with `?companionDev=1` can, through a same-origin proxy.

## Run it locally

From the repository root, in two terminals:

```bash
npm run dev:worker
npm run dev:timer
```

Wrangler serves the worker on `http://127.0.0.1:8787`. The timer server serves the page on `http://127.0.0.1:8006` and proxies `/companion-api` to the worker, so the browser stays on one origin and the production Content Security Policy is unchanged. Both commands stay on your machine. Do not add `--remote`, and do not run `wrangler login` or `wrangler deploy`.

Open `http://127.0.0.1:8006/?companionDev=1`. Start sharing, then use Open companion for a second tab. The write token stays in the Storyteller page's memory. The companion tab only receives the session code.

`npm run dev:timer` is the local page server. Do not use `npm run dev`. GitHub Pages has no `/companion-api` proxy, so the public site cannot reach a worker on your machine.

Create a session:

```bash
curl -s -X POST http://127.0.0.1:8787/sessions
```

The response is the six-character code and the Storyteller write token. The token is shown once. It must not be placed in a URL.

Open a companion socket at `ws://127.0.0.1:8787/sessions/CODE`. The first message is `waiting`, or a `snapshot` if the Storyteller has already published.

Open the Storyteller socket at `ws://127.0.0.1:8787/sessions/CODE/storyteller`. The first message must be:

```json
{ "type": "auth", "token": "WRITE_TOKEN" }
```

Then publish a Foundation 1 snapshot. Timing fields are optional and sit beside `state`, not inside it:

```json
{ "type": "publish", "state": { "v": 1, "phase": "day", "day": 1, "counts": { "townsfolk": 7, "outsider": 0, "minion": 2, "demon": 1, "traveller": 0 }, "timer": { "status": "running", "kind": "day", "remainingMs": 120000, "rate": 1 } }, "capturedAt": 1790000000000, "upstreamOffsetMs": 12 }
```

`capturedAt` is the Storyteller's `Date.now()` when it handed the snapshot to the transport. `upstreamOffsetMs` is the Storyteller's estimate of worker clock minus its own clock. The worker stores both and does not change `remainingMs`. A publish whose `capturedAt` is older than the one already stored is rejected with `stale-publish` and does not advance the revision.

After the snapshot is stored, the authenticated Storyteller socket receives:

```json
{ "type": "published", "rev": 1, "serverTime": 1790000000040 }
```

Readers do not receive that acknowledgement. `serverTime` is the worker clock at receipt. A rejected publish gets an `error` and no `published` message.

Either socket may send `{ "type": "ping", "id": "sample-1" }`. The reply is `{ "type": "pong", "id": "sample-1", "serverTime": 1790000000100 }`. Unauthenticated Storyteller sockets cannot ping.

End the session with `{ "type": "end" }`.

`GET /health` returns `{ "ok": true }` so a local script can wait for the worker.

## Two browser tabs

1. `npm run dev:worker`
2. `npm run dev:timer`
3. Open `http://127.0.0.1:8006/?companionDev=1`
4. Start sharing and note the code.
5. Open companion. The second tab shows the public counts, phase, day, and a countdown that moves locally.
6. Pause, resume, accelerate, reset, and advance the day on the timer. The companion follows.
7. Drop connection on either side. The game keeps running. Sharing reconnects with a fresh snapshot, or the companion rejoins the same revision.
8. End session. The companion shows `ended`. The timer on the first tab still runs.

## Clock

`performance.now()` is not compared across devices. `Date.now()` is only compared with the worker after a ping. The offset is worker time minus local time, taken at the middle of the round trip. Samples with a negative trip or a trip over 500ms are dropped. After three samples, a trip slower than twice the best is dropped. The five fastest are kept. A correction under 150ms moves halfway so the display does not jump. A larger correction steps.

The companion then advances that estimate with its own monotonic clock and calls `readCompanionCountdown` with `offsetMs: 0`, because `now` is already the worker-clock estimate. When the Storyteller has sent `upstreamOffsetMs`, the countdown is anchored at `capturedAt + upstreamOffsetMs` (`adjusted`). Until that offset exists, the anchor is the worker's `serverTime` (`receipt`), which is later than the capture and is not treated as zero delay.

A snapshot is stale 25 seconds after it was received, measured on the companion's monotonic clock. A paused countdown stays fresh while heartbeats or other snapshots arrive. Heartbeats are every 10 seconds. A disconnected companion is not shown as fresh just because its last countdown is still on screen.

## Tests

```bash
npm run test:worker
npm run test:unit
npm test
npm run test:integration
```

`npm run test:worker` uses `@cloudflare/vitest-plugin` inside the local Workers runtime. `npm run test:integration` starts that same worker with Wrangler, serves the timer, and runs `cypress/integration/companion-local.cy.js` against both. Neither needs a Cloudflare account.

`npm test` is the existing Cypress suite against `serve`. It does not start the worker. The dev panel spec only checks that the panel is absent. Node tests use fake clocks and fake sockets.

## Session lookup

The entry worker does not remember codes between requests. `SessionDirectory` is one SQLite Durable Object (`idFromName('companion-sessions')`) and is the only code index. `CompanionSession` is a second SQLite class, one object per session, named by the internal session id.

Both classes are declared with `new_sqlite_classes` in `wrangler.jsonc`. That is the supported SQLite backend. The older `new_classes` key is the key-value backend, which the Workers Free plan cannot create. No KV namespace and no extra paid product is required.

Workers Free, as documented in October 2026, includes SQLite Durable Objects with about 5 million row reads per day, 100,000 row writes per day, and 5 GB stored. A create, a join, and a cleanup are a handful of rows. A retired code stays in the directory so it cannot be issued again. Session objects are left as tombstones after expiry; deleting their snapshot does not remove the directory row, so cleanup always retires that row as well.

## What this service enforces

- Write token: 32 random bytes, returned once. Only its SHA-256 is stored. A reader cannot authenticate as the Storyteller. A new successful auth closes the previous Storyteller socket. There is one Storyteller at a time.
- Public snapshots: Foundation 1 `validateCompanionState`. Messages larger than 2048 bytes are refused.
- Revisions start at 1 and increase by one on the server. `serverTime` is when the session object accepted the publish. The countdown remainder is stored as the Storyteller sent it.
- Twenty readers per session.
- Thirty accepted publishes per session in a rolling 10 seconds.
- One hundred and twenty session creates per minute for the whole directory.
- Idle expiry is three hours after the last accepted publish (or after creation, if nothing was published). The absolute cap is twelve hours. The Storyteller can also end the session. An alarm wakes the object; there is no permanent interval.
- One alarm covers authentication deadlines and session expiry. It is always the earliest of the twelve-hour cap, the three-hour idle deadline, and any future authentication deadline. An early alarm closes only the sockets whose deadline has passed, then schedules the next deadline. Restoring the object after eviction arms that alarm again.

## What it does not enforce

Failed code guesses are not rate limited per IP. A global counter would lock out every table when one client guessed badly. Per-IP limits need a Cloudflare Rate Limiting rule or WAF on the deployed route. That cannot be exercised in this local runtime, and it is not implemented here.

The directory create cap is global, not per IP. One client can spend it.

CORS headers are not a security boundary. This worker does not send them. The local timer reaches it through the same-origin `/companion-api` proxy. A deployed page would need an explicit origin allow-list before the browser called the worker directly.
