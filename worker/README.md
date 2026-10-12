# Companion session service

Local Cloudflare Worker for Companion Mode. It stores one session per game and forwards public timer snapshots to connected companions. It is not deployed, and the timer page does not call it.

## Run it locally

From the repository root:

```bash
npm run dev:worker
```

Wrangler serves the worker on `http://127.0.0.1:8787`. That command stays on your machine. Do not add `--remote`, and do not run `wrangler login` or `wrangler deploy` for this chunk.

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

Then publish a Foundation 1 snapshot:

```json
{ "type": "publish", "state": { "v": 1, "phase": "day", "day": 1, "counts": { "townsfolk": 7, "outsider": 0, "minion": 2, "demon": 1, "traveller": 0 }, "timer": { "status": "running", "kind": "day", "remainingMs": 120000, "rate": 1 } } }
```

End the session with `{ "type": "end" }`.

## Tests

```bash
npm run test:worker
```

The suite uses `@cloudflare/vitest-plugin` and runs inside the local Workers runtime. It does not need a Cloudflare account.

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

## What it does not enforce

Failed code guesses are not rate limited per IP. A global counter would lock out every table when one client guessed badly. Per-IP limits need a Cloudflare Rate Limiting rule or WAF on the deployed route. That cannot be exercised in this local runtime, and it is not implemented here.

The directory create cap is global, not per IP. One client can spend it.

CORS headers are not a security boundary. This worker does not send them. A later chunk that the browser calls will need an explicit origin allow-list.

## Clock synchronisation, later

`serverTime` is the worker's receipt time. `state.timer.remainingMs` is the remainder the Storyteller captured, unchanged. Those instants are not the same, and this service does not estimate the difference.

The next chunk needs three things this service deliberately omits:

- a capture timestamp sent beside the v1 object, not inside it
- a measured offset between the companion and the worker
- `readCompanionCountdown` from `companionClock.js`, which already applies an offset supplied by its caller
