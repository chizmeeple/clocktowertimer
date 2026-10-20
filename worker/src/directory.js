import { DurableObject } from 'cloudflare:workers';
import {
  CODE_PATTERN,
  CREATE_LIMIT,
  CREATE_WINDOW_MS,
} from './protocol.js';

// One SQLite object holds every session code. The entry Worker is stateless,
// so it cannot keep this map itself. A code row is retired in place and is
// never given to a later session.
export const DIRECTORY_NAME = 'companion-sessions';

export function directoryStub(env) {
  const id = env.SESSION_DIRECTORY.idFromName(DIRECTORY_NAME);
  return env.SESSION_DIRECTORY.get(id);
}

export class SessionDirectory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS codes (
          code TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS create_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER NOT NULL
        )
      `);
    });
  }

  async creationAllowed(now) {
    this.#pruneCreates(now);
    return this.#createCount() < CREATE_LIMIT;
  }

  async reserve(code, sessionId, createdAt) {
    if (!CODE_PATTERN.test(code) || typeof sessionId !== 'string') {
      return { ok: false, reason: 'invalid-code' };
    }
    const existing = this.ctx.storage.sql
      .exec('SELECT status FROM codes WHERE code = ?', code)
      .toArray();
    if (existing.length > 0) return { ok: false, reason: 'collision' };
    this.ctx.storage.sql.exec(
      `INSERT INTO codes (code, session_id, status, created_at)
       VALUES (?, ?, 'active', ?)`,
      code,
      sessionId,
      createdAt
    );
    this.ctx.storage.sql.exec(
      'INSERT INTO create_log (created_at) VALUES (?)',
      createdAt
    );
    return { ok: true };
  }

  async lookup(code) {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT session_id FROM codes WHERE code = ? AND status = 'active'`,
        code
      )
      .toArray();
    if (rows.length === 0) return { sessionId: null };
    return { sessionId: rows[0].session_id };
  }

  // Read-only. The session id is not returned, and nothing is inserted or
  // revived. Retired, unknown, and malformed codes share one answer.
  async availability(code) {
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
      return { availability: 'unavailable' };
    }
    const rows = this.ctx.storage.sql
      .exec('SELECT status FROM codes WHERE code = ?', code)
      .toArray();
    if (rows.length === 1 && rows[0].status === 'active') {
      return { availability: 'active' };
    }
    return { availability: 'unavailable' };
  }

  // Idempotent. A repeated cleanup, or a cleanup whose session id does not
  // match, cannot retire a different live session.
  async retire(code, sessionId) {
    this.ctx.storage.sql.exec(
      `UPDATE codes SET status = 'retired'
       WHERE code = ? AND session_id = ? AND status = 'active'`,
      code,
      sessionId
    );
    return { ok: true };
  }

  #pruneCreates(now) {
    this.ctx.storage.sql.exec(
      'DELETE FROM create_log WHERE created_at < ?',
      now - CREATE_WINDOW_MS
    );
  }

  #createCount() {
    const rows = this.ctx.storage.sql
      .exec('SELECT COUNT(*) AS n FROM create_log')
      .toArray();
    return Number(rows[0]?.n ?? 0);
  }
}
