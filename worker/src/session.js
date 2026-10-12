import { DurableObject } from 'cloudflare:workers';
import { validateCompanionState } from '../../companionState.js';
import { directoryStub } from './directory.js';
import {
  AUTH_TIMEOUT_MS,
  IDLE_MS,
  MAX_LIFETIME_MS,
  MAX_MESSAGE_BYTES,
  MAX_READERS,
  MAX_STORYTELLER_SOCKETS,
  PUBLISH_LIMIT,
  PUBLISH_WINDOW_MS,
  messageByteLength,
  numberSetting,
  parseClientMessage,
  sha256Hex,
  tokensMatch,
} from './protocol.js';

// One session object. Hibernatable WebSockets keep their role on the socket
// attachment, and the latest snapshot lives in SQLite. A second Storyteller
// that presents the write token replaces the previous Storyteller socket.
// Readers cannot change role.
//
// serverTime is when this object accepted the publish. It is not the moment
// the Storyteller sampled the countdown. Remaining time is stored as received.
export class CompanionSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          session_id TEXT NOT NULL,
          code TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_publish_at INTEGER,
          rev INTEGER NOT NULL,
          state_json TEXT,
          status TEXT NOT NULL,
          captured_at REAL,
          upstream_offset_ms REAL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS publish_times (
          at INTEGER NOT NULL
        )
      `);
      this.#ensureTimingColumns();
      this.#closeExpiredAuth(Date.now());
      await this.#schedule();
    });
  }

  #ensureTimingColumns() {
    const names = this.ctx.storage.sql
      .exec('PRAGMA table_info(meta)')
      .toArray()
      .map((column) => column.name);
    if (!names.includes('captured_at')) {
      this.ctx.storage.sql.exec('ALTER TABLE meta ADD COLUMN captured_at REAL');
    }
    if (!names.includes('upstream_offset_ms')) {
      this.ctx.storage.sql.exec(
        'ALTER TABLE meta ADD COLUMN upstream_offset_ms REAL'
      );
    }
  }

  async open({ sessionId, code, tokenHash, createdAt }) {
    const existing = this.#meta();
    if (existing) {
      if (existing.session_id === sessionId && existing.status === 'open') return;
      throw new Error('session-exists');
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO meta (
         id, session_id, code, token_hash, created_at, last_publish_at, rev, state_json, status
       ) VALUES (1, ?, ?, ?, ?, NULL, 0, NULL, 'open')`,
      sessionId,
      code,
      tokenHash,
      createdAt
    );
    await this.#schedule();
  }

  async fetch(request) {
    const storyteller = new URL(request.url).pathname.endsWith('/storyteller');
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'upgrade-required' }, { status: 426 });
    }
    const meta = this.#meta();
    if (!meta || meta.status !== 'open') {
      return Response.json({ error: 'session-closed' }, { status: 410 });
    }
    if (!storyteller && this.ctx.getWebSockets('reader').length >= MAX_READERS) {
      return Response.json(
        { error: 'reader-limit', limit: MAX_READERS },
        { status: 403 }
      );
    }
    if (
      storyteller &&
      this.ctx.getWebSockets('storyteller').length >= MAX_STORYTELLER_SOCKETS
    ) {
      return Response.json({ error: 'storyteller-pending' }, { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const role = storyteller ? 'storyteller' : 'reader';
    this.ctx.acceptWebSocket(server, [role]);
    const now = Date.now();
    server.serializeAttachment({
      role,
      authenticated: false,
      authDeadline: storyteller ? now + this.#authTimeoutMs() : null,
    });
    if (role === 'reader') {
      this.#send(server, this.#envelope(now) ?? { type: 'waiting', serverTime: now });
    } else {
      await this.#schedule();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') {
      this.#send(ws, { type: 'error', reason: 'invalid-message' });
      return;
    }
    if (messageByteLength(message) > MAX_MESSAGE_BYTES) {
      this.#send(ws, { type: 'error', reason: 'too-large' });
      return;
    }
    const parsed = parseClientMessage(message);
    if (!parsed.ok) {
      this.#send(ws, { type: 'error', reason: parsed.reason });
      return;
    }
    const meta = this.#meta();
    if (!meta || meta.status !== 'open') {
      this.#send(ws, { type: 'error', reason: 'session-closed' });
      return;
    }
    if (parsed.value.type === 'ping') {
      const attachment = ws.deserializeAttachment();
      const joined =
        attachment?.role === 'reader' ||
        (attachment?.role === 'storyteller' && attachment.authenticated);
      if (!joined) {
        this.#send(ws, { type: 'error', reason: 'unauthenticated' });
        return;
      }
      this.#send(ws, {
        type: 'pong',
        id: parsed.value.id,
        serverTime: Date.now(),
      });
      return;
    }
    if (parsed.value.type === 'auth') {
      await this.#authenticate(ws, parsed.value.token);
      return;
    }
    const attachment = ws.deserializeAttachment();
    if (attachment?.role !== 'storyteller' || !attachment.authenticated) {
      const reason = attachment?.role === 'reader' ? 'not-writer' : 'unauthenticated';
      this.#send(ws, { type: 'error', reason });
      if (attachment?.role === 'reader') this.#close(ws, 4003, 'not-writer');
      return;
    }
    if (parsed.value.type === 'end') {
      await this.#end('ended');
      return;
    }
    await this.#publish(ws, parsed.value);
  }

  async webSocketClose() {}

  async webSocketError() {}

  async alarm() {
    const meta = this.#meta();
    if (!meta) return;
    if (meta.status !== 'open') {
      await directoryStub(this.env).retire(meta.code, meta.session_id);
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const now = Date.now();
    this.#closeExpiredAuth(now);
    const absolute = meta.created_at + MAX_LIFETIME_MS;
    const idle = (meta.last_publish_at ?? meta.created_at) + IDLE_MS;
    if (now >= absolute || now >= idle) {
      await this.#end(now >= absolute ? 'lifetime' : 'idle');
      return;
    }
    await this.ctx.storage.setAlarm(this.#soonest(absolute, idle));
  }

  async #authenticate(ws, token) {
    const attachment = ws.deserializeAttachment();
    if (attachment?.role !== 'storyteller') {
      this.#send(ws, { type: 'error', reason: 'not-writer' });
      this.#close(ws, 4003, 'not-writer');
      return;
    }
    const meta = this.#meta();
    if (!meta || meta.status !== 'open' || typeof token !== 'string') {
      this.#send(ws, { type: 'error', reason: 'invalid-token' });
      this.#close(ws, 4001, 'invalid-token');
      return;
    }
    const hash = await sha256Hex(token);
    if (!tokensMatch(hash, meta.token_hash)) {
      this.#send(ws, { type: 'error', reason: 'invalid-token' });
      this.#close(ws, 4001, 'invalid-token');
      return;
    }
    for (const other of [...this.ctx.getWebSockets('storyteller')]) {
      if (other === ws) continue;
      if (!other.deserializeAttachment()?.authenticated) continue;
      this.#send(other, { type: 'replaced' });
      this.#close(other, 4002, 'replaced');
    }
    ws.serializeAttachment({
      role: 'storyteller',
      authenticated: true,
      authDeadline: null,
    });
    this.#send(ws, { type: 'authenticated' });
    const envelope = this.#envelope(Date.now());
    if (envelope) this.#send(ws, envelope);
    await this.#schedule();
  }

  async #publish(ws, message) {
    const validated = validateCompanionState(message.state);
    if (!validated.ok) {
      this.#send(ws, {
        type: 'error',
        reason: 'invalid-state',
        detail: validated.reason,
      });
      return;
    }
    const meta = this.#meta();
    const capturedAt = Number.isFinite(message.capturedAt) ? message.capturedAt : null;
    const upstreamOffsetMs = Number.isFinite(message.upstreamOffsetMs)
      ? message.upstreamOffsetMs
      : null;
    if (
      capturedAt != null &&
      Number.isFinite(meta.captured_at) &&
      capturedAt < meta.captured_at
    ) {
      this.#send(ws, { type: 'error', reason: 'stale-publish' });
      return;
    }
    const now = Date.now();
    if (!this.#takePublishSlot(now)) {
      this.#send(ws, { type: 'error', reason: 'rate-limited' });
      return;
    }
    const rev = meta.rev + 1;
    this.ctx.storage.sql.exec(
      `UPDATE meta
       SET rev = ?, state_json = ?, last_publish_at = ?, captured_at = ?, upstream_offset_ms = ?
       WHERE id = 1`,
      rev,
      JSON.stringify(validated.value),
      now,
      capturedAt,
      upstreamOffsetMs
    );
    this.#sendAuthenticated({
      type: 'snapshot',
      rev,
      serverTime: now,
      capturedAt,
      upstreamOffsetMs,
      state: validated.value,
    });
    this.#send(ws, { type: 'published', rev, serverTime: now });
    await this.#schedule();
  }

  async #end(reason) {
    const meta = this.#meta();
    if (!meta) return;
    if (meta.status === 'open') {
      this.ctx.storage.sql.exec(
        `UPDATE meta
         SET status = 'closed', state_json = NULL, token_hash = ''
         WHERE id = 1`
      );
      this.ctx.storage.sql.exec('DELETE FROM publish_times');
      const payload = { type: 'session-ended', reason };
      for (const ws of [...this.ctx.getWebSockets()]) {
        this.#send(ws, payload);
        this.#close(ws, 4000, reason);
      }
    }
    await directoryStub(this.env).retire(meta.code, meta.session_id);
    await this.ctx.storage.deleteAlarm();
  }

  async #schedule() {
    const meta = this.#meta();
    if (!meta || meta.status !== 'open') return;
    const now = Date.now();
    const absolute = meta.created_at + MAX_LIFETIME_MS;
    const idle = (meta.last_publish_at ?? meta.created_at) + IDLE_MS;
    if (now >= absolute || now >= idle) {
      await this.#end(now >= absolute ? 'lifetime' : 'idle');
      return;
    }
    await this.ctx.storage.setAlarm(this.#soonest(absolute, idle));
  }

  #soonest(absolute, idle) {
    let soonest = Math.min(absolute, idle);
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets('storyteller')) {
      const attachment = ws.deserializeAttachment();
      const deadline = attachment?.authDeadline;
      if (!attachment?.authenticated && Number.isFinite(deadline) && deadline > now) {
        soonest = Math.min(soonest, deadline);
      }
    }
    return soonest;
  }

  #closeExpiredAuth(now) {
    for (const ws of [...this.ctx.getWebSockets('storyteller')]) {
      const attachment = ws.deserializeAttachment();
      if (!attachment || attachment.authenticated) continue;
      if (Number.isFinite(attachment.authDeadline) && now >= attachment.authDeadline) {
        this.#send(ws, { type: 'error', reason: 'auth-timeout' });
        this.#close(ws, 4001, 'auth-timeout');
      }
    }
  }

  #takePublishSlot(now) {
    this.ctx.storage.sql.exec(
      'DELETE FROM publish_times WHERE at <= ?',
      now - PUBLISH_WINDOW_MS
    );
    const rows = this.ctx.storage.sql
      .exec('SELECT COUNT(*) AS n FROM publish_times')
      .toArray();
    if (Number(rows[0]?.n ?? 0) >= this.#publishLimit()) return false;
    this.ctx.storage.sql.exec('INSERT INTO publish_times (at) VALUES (?)', now);
    return true;
  }

  #envelope(serverTime) {
    const meta = this.#meta();
    if (!meta?.state_json) return null;
    return {
      type: 'snapshot',
      rev: meta.rev,
      serverTime,
      capturedAt: Number.isFinite(meta.captured_at) ? meta.captured_at : null,
      upstreamOffsetMs: Number.isFinite(meta.upstream_offset_ms)
        ? meta.upstream_offset_ms
        : null,
      state: JSON.parse(meta.state_json),
    };
  }

  #sendAuthenticated(payload, { readers = true } = {}) {
    for (const ws of [...this.ctx.getWebSockets()]) {
      const attachment = ws.deserializeAttachment();
      if (!attachment) continue;
      const isReader = attachment.role === 'reader';
      const isWriter = attachment.role === 'storyteller' && attachment.authenticated;
      if (isWriter || (readers && isReader)) this.#send(ws, payload);
    }
  }

  #meta() {
    const rows = this.ctx.storage.sql
      .exec('SELECT * FROM meta WHERE id = 1')
      .toArray();
    return rows[0] ?? null;
  }

  #authTimeoutMs() {
    return numberSetting(
      this.env.AUTH_TIMEOUT_MS,
      AUTH_TIMEOUT_MS,
      50,
      30_000
    );
  }

  #publishLimit() {
    return numberSetting(this.env.PUBLISH_LIMIT, PUBLISH_LIMIT, 1, 100);
  }

  #send(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // A closed socket must not stop the session.
    }
  }

  #close(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }
}
