# Companion Mode — Architecture and Operations

> Living reference for the read-only, player-facing companion to Tower Timer. Update this document as the implementation evolves.

## Purpose

Companion Mode lets players view **public** game information on their own phones while a Storyteller runs the main timer. It is optional: the Storyteller's timer must continue to work if the companion service or internet connection fails.

The intended companion display includes:

- Day/night phase and day number.
- Public counts of Townsfolk, Outsiders, Minions, Demons, and Travellers (including zero).
- A countdown that follows the Storyteller's timer as closely as practical.
- Optional near-zero and zero alerts, subject to browser sound/vibration permissions and foreground/background limitations.
- Portrait-first layout with usable landscape support.

It must **not** expose private roles, Storyteller-only settings, or the session's write token.

## Hosting architecture

**GitHub Pages only serves static files.** It does not run a Node server, WebSocket server, or Durable Objects. The browser executes the timer and companion JavaScript; **Cloudflare Workers and Durable Objects** provide session management and live synchronisation.

```mermaid
flowchart TB
    GH["GitHub Pages<br/>timer.arcane-scripts.net<br/>Static HTML / CSS / JS"]
    ST["Storyteller browser<br/>Main timer + optional publishing"]
    PL["Player browsers<br/>Read-only companion"]
    CF["Cloudflare Worker<br/>clocktower-companion.redmeeple.workers.dev"]
    DO["Durable Objects<br/>SessionDirectory + CompanionSession"]

    GH -->|Serves application| ST
    GH -->|Serves companion page| PL
    ST -->|HTTPS create session; WSS authenticate + publish| CF
    CF -->|WSS public snapshots| PL
    CF <--> DO
```

Production connections go **directly from browsers to Cloudflare** using HTTPS and `wss://`. No GitHub Pages server or production reverse proxy is needed. Both `companion.html` and the Storyteller page allow that exact worker origin in `connect-src` (HTTPS and WSS, with no wildcard). The Worker allows the site's exact Origin.

### Production endpoint

- Worker: `https://clocktower-companion.redmeeple.workers.dev`
- Storyteller application: `https://timer.arcane-scripts.net`
- Player-facing companion: `https://timer.arcane-scripts.net/companion.html?code=ABC123`
- A valid code in the address is normalised and joined automatically. Without a code, the page asks for one. The diagnostic client remains at `companion-dev.html`.

The `redmeeple` portion is the account-wide `workers.dev` subdomain; `clocktower-companion` is this Worker's name.

## Responsibilities and trust boundaries

| Component | Responsibility |
| --- | --- |
| Main timer (browser) | Owns authoritative game and timer state; works without Companion Mode. |
| Companion publishing adapter | Projects and validates **public** state; sends updates only when enabled. |
| Cloudflare Worker | Routes HTTP and WebSocket requests, enforces Origin restrictions and rate limits. |
| `SessionDirectory` Durable Object | Creates and tracks session codes; retires codes. |
| `CompanionSession` Durable Object | Authenticates the writer, retains latest snapshot, distributes revisions, handles expiry. |
| Companion page (browser) | Reads public snapshots and locally interpolates the countdown; cannot publish. |

The Storyteller receives a short session code and a separate private write token. Players need only the code. The token is sent in the first authenticated Storyteller WebSocket message, **not** in the URL. Readers have no publishing privileges.

### Session lifecycle

```mermaid
sequenceDiagram
    participant S as Storyteller browser
    participant W as Cloudflare Worker
    participant D as Durable Objects
    participant P as Player browser

    S->>W: POST /sessions
    W->>D: Create session
    D-->>W: Code + private write token
    W-->>S: Session credentials
    S->>W: WSS /sessions/:code/storyteller
    S->>W: auth {token}
    W->>D: Authenticate writer
    S->>W: publish {state}
    W->>D: Validate and store revision
    W-->>S: published {rev, serverTime}
    P->>W: WSS /sessions/:code
    W->>D: Subscribe read-only
    D-->>P: snapshot {rev, serverTime, state}
    S->>W: Further public snapshots
    W-->>P: Updated snapshots
    S->>W: end
    W-->>P: Session ended
```

A companion page should use the latest authoritative snapshot, account for measured clock offset, and render a smooth local countdown rather than waiting for a server message every second. On reconnect, it should recover the latest snapshot. A locally calculated zero is **not** automatically authoritative dusk/end-of-day confirmation.

## Storyteller settings

Companion Mode is configured in the main timer's Settings dialog, on the **Companion Mode** tab. Nothing is added to the timer face. Both settings are off until the Storyteller turns them on, and they are stored with the other timer settings.

- **Enable Companion Mode** is the master switch. While it is off, the timer does not create a session, connect to the Worker, or publish. The session controls stay unavailable. Turning it off during an active session asks for confirmation, because players lose access. Cancelling that confirmation leaves the session running.
- **Start automatically** starts one sharing session when Tower Timer opens. It does nothing unless Companion Mode is also on. It runs once per page load, without opening Settings, and a failure leaves the timer playable so the Storyteller can press **Start sharing**. Starting a new game, resetting the day, or changing player or traveller counts does not create another session. Reloading the page does not reuse the previous write token; a new page load can receive a new code.

**Start sharing** creates the session and publishes the current public snapshot. The status moves through Connecting and only says Live after the Storyteller socket has connected and authenticated. **Stop sharing** ends that session for connected players and leaves Companion Mode enabled, so another session can be started. Closing Settings, or switching tabs, does not stop the session.

The six-character code is shown only while that session is connecting, live, or reconnecting. **Copy link** and **Show QR code** use the public player URL:

`https://timer.arcane-scripts.net/companion.html?code=<SESSION_CODE>`

The link and the QR code contain the code and nothing else. The write token is not in the link, the QR image, the page, or the logs. The QR code can be closed without ending the session.

The same code stays in use across games in one evening. The public snapshot updates through the existing publishing points. A session ends when the Storyteller stops it, when Companion Mode is turned off, or when the Worker expires it (idle sessions end about three hours after the last accepted publish, and no session lasts longer than twelve hours). An expired or ended code is not shown as still valid, and the timer does not silently mint a replacement. The Storyteller starts a new session explicitly.

A network failure sets the status to Offline and does not stop the countdown.

## Public state protocol

Protocol version 1 is a public projection, not the full internal game state. Example:

```json
{
  "v": 1,
  "phase": "day",
  "day": 3,
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
    "remainingMs": 125400,
    "rate": 1
  }
}
```

The server wraps snapshots in a revisioned envelope with server timing information. The public schema and validation are implemented in `companionState.js`; countdown projection is in `companionClock.js`. Avoid sending full internal state or private information.

## Local development versus production

| Concern | Local development | Production |
| --- | --- | --- |
| Frontend hosting | `npm run dev:timer` at `http://127.0.0.1:8006` | GitHub Pages |
| Backend | `npm run dev:worker` or remote Cloudflare Worker | Remote Cloudflare Worker |
| Browser API/WebSocket URL | Same-origin `/companion-api` development proxy | Direct HTTPS / `wss://` Worker endpoint |
| Why a proxy? | Local pages call same-origin `/companion-api`, including when `COMPANION_WORKER_URL` selects the deployed Worker | Not needed; the Storyteller page connects to the Worker directly |
| Player page | `companion.html` on the local server, still via `/companion-api` | `companion.html` connects directly to the deployed worker |
| Publishing UI | Settings tab, plus the development panel at `?companionDev=1` | Settings tab, off until enabled |

For a local Worker:

```bash
npm run dev:worker
npm run dev:timer
```

For the deployed Worker with the local frontend:

```bash
COMPANION_WORKER_URL='https://clocktower-companion.redmeeple.workers.dev' \
  npm run dev:timer
```

Then visit `http://127.0.0.1:8006/?companionDev=1`. After a session starts, **Open companion** opens the player page and **Open diagnostics** opens the diagnostic client. Both use the current code and are not links once that session has ended. The panel and the Settings tab share one session controller, so they cannot start two sessions for the same page. The panel remains a localhost diagnostic tool. Its stop and drop actions are local diagnostic controls; **Stop sharing** in Settings is what tells the Worker to end the session for players.

`companion.html` allows connections only to itself and `clocktower-companion.redmeeple.workers.dev` (HTTPS and WSS). On localhost it still uses the `/companion-api` proxy, so the same page works with a local worker or `COMPANION_WORKER_URL`. The Storyteller page allows the same worker host, for HTTPS and WSS only, and uses it when the page is not served from localhost.

The companion can play a short sound and vibrate about 30 seconds before a running countdown reaches zero, and again at zero. Both are off until the player opts in, and only while the page is open and the phone is unlocked. "Keep the screen awake" is also off until asked for, and the browser may refuse it. Neither feature runs in the background.

## Deployment and verification

The Worker configuration is `worker/wrangler.jsonc`; Worker implementation and tests live under `worker/`. Cloudflare is the only required live server-side hosting provider.

```bash
npx wrangler login
npx wrangler whoami
npx wrangler deploy --config worker/wrangler.jsonc --dry-run
npx wrangler deploy --config worker/wrangler.jsonc
```

Health check:

```bash
curl -i https://clocktower-companion.redmeeple.workers.dev/health
```

Expected: HTTP `200` and `{"ok":true}`.

Remote session smoke test:

```bash
COMPANION_WORKER_URL='https://clocktower-companion.redmeeple.workers.dev' \
COMPANION_ORIGIN='https://timer.arcane-scripts.net' \
node scripts/companion-smoke.mjs
```

Expected: session code, `Published revision 1`, and `Session ended`.

### Deployment status — 13 October 2026

- Cloudflare Worker deployed successfully to `clocktower-companion.redmeeple.workers.dev`.
- `/health` returned HTTP 200 with `{"ok":true}`.
- Remote smoke test created a session, published revision 1, and ended the session.
- Remote two-window browser test confirmed Storyteller publishing and companion reception, with matching revisions.
- The player page is `companion.html`. It joins with a code and talks to the deployed worker when it is not served from localhost.
- Storytellers turn sharing on from Settings. The timer face has no Companion Mode controls. Sharing stays off until both the setting and a session exist.

The `curl --max-time` timeout during a successful WebSocket upgrade is expected: WebSockets remain open. Receiving snapshot frames before that timeout demonstrates data delivery for that diagnostic connection, **not** a completed browser end-to-end test.

## Operational considerations

- The main timer remains authoritative and should never wait on Cloudflare to advance gameplay.
- Companion Mode should fail visibly but gracefully when disconnected or stale, without breaking the main timer.
- Browser tabs can be suspended; sound/vibration alerts and timely updates cannot be guaranteed when a phone is locked or the page is backgrounded. On return, refresh the displayed state and indicate missed completion where appropriate.
- Keep the private write token out of links, QR codes, logs, and player-facing state.
- The Worker currently uses Origin allowlisting, per-IP rate limits, session expiration, and reader/publish limits. See `worker/README.md` and the implementation for authoritative limits and deployment procedures.
- To inspect deployments or roll back:

```bash
npx wrangler deployments list --config worker/wrangler.jsonc
npx wrangler rollback --config worker/wrangler.jsonc
```

## Known limitations

- Worker sessions expire. An idle session ends about three hours after the last accepted publish, and every session ends within twelve hours. The Settings tab then says the code is no longer valid. It does not create a replacement on its own.
- A reload does not restore the write token. Automatic start, when enabled, creates a new code for that page load.
- Alerts and the wake lock on the player page work only while that page is open and the phone is unlocked.
- The development panel is not part of the public timer. It appears only at `http://127.0.0.1:8006/?companionDev=1` or the localhost equivalent.

## Next steps

1. Validate the companion on real phones, including locked screens and background tabs. Alerts and the wake lock are foreground-only.
2. Decide whether the 30-second warning should follow a Storyteller setting instead of the fixed companion threshold.

## Useful source files

- `companionState.js` — public state projection and validation.
- `companionClock.js` — client-side countdown projection.
- `companionPublish.js` — opt-in publishing adapter.
- `companionTransport.js`, `companionClient.js`, `companionSync.js` — transport and synchronisation.
- `companion.html`, `companion.css`, `companion-page.js` — player page.
- `companionCode.js`, `companionDisplay.js`, `companionAlerts.js` — code entry, presentation and foreground warnings.
- `companionSession.js` — the single Storyteller session used by Settings and the development panel.
- `companionDev.js`, `companion-dev.html`, `companion-dev-page.js` — development harness.
- `scripts/dev-server.mjs` — local frontend server and `/companion-api` proxy.
- `scripts/companion-smoke.mjs` — remote smoke test.
- `worker/` — Cloudflare Worker, Durable Objects, Wrangler config and tests.

Keep this file aligned with the actual implementation and `worker/README.md`; it is an architectural guide, not a substitute for tests or source code.
