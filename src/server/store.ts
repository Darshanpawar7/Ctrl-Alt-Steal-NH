// Saving the game. The state is split into slices (teams, answers, each
// crew's board…) and only slices that changed are written, in batches. If
// the database is briefly unreachable the game keeps running from memory and
// the writes are retried until they land, so players never wait on storage.

import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import type { StorageHealth } from "../shared/protocol";
import type { AuditEntry, GameState } from "../shared/types";

export interface LoadedGame {
  state: GameState | null;
  recentAudit: AuditEntry[];
}

/** Key -> value to write, or null to delete. */
type Changes = Map<string, unknown | null>;

const SLICES = ["event", "caseFile", "rounds", "teams", "subs", "hints", "adjustments", "feed"] as const;
const META = "meta";
const BOARD = "board:";
const RETRY_MS = [500, 1000, 2000, 5000, 10000];

/** Works out which slices changed by comparing object identity (immer keeps unchanged ones). */
class SliceTracker {
  private refs = new Map<string, unknown>();

  diff(state: GameState): Changes {
    const changes: Changes = new Map();
    const meta = [state.updatedAt, state.live, state.status, state.vault];
    const lastMeta = this.refs.get(META) as unknown[] | undefined;
    if (!lastMeta || meta.some((v, i) => v !== lastMeta[i])) {
      changes.set(META, { schema: state.schema, updatedAt: state.updatedAt, live: state.live, status: state.status, vault: state.vault });
      this.refs.set(META, meta);
    }
    for (const slice of SLICES) {
      if (this.refs.get(slice) !== state[slice]) {
        changes.set(slice, state[slice]);
        this.refs.set(slice, state[slice]);
      }
    }
    const boards = new Set<string>();
    for (const [teamId, board] of Object.entries(state.boards)) {
      const key = BOARD + teamId;
      boards.add(key);
      if (this.refs.get(key) !== board) {
        changes.set(key, board);
        this.refs.set(key, board);
      }
    }
    for (const key of [...this.refs.keys()]) {
      if (key.startsWith(BOARD) && !boards.has(key)) {
        changes.set(key, null);
        this.refs.delete(key);
      }
    }
    return changes;
  }
}

/** Rebuilds a state from stored slices. Returns null if nothing has been saved yet. */
function assemble(rows: Map<string, unknown>): GameState | null {
  const meta = rows.get(META) as Pick<GameState, "schema" | "updatedAt" | "live" | "status" | "vault"> | undefined;
  if (!meta) return null;
  const boards: GameState["boards"] = {};
  for (const [key, value] of rows) if (key.startsWith(BOARD)) boards[key.slice(BOARD.length)] = value as GameState["boards"][string];
  const state: Record<string, unknown> = { ...meta, boards, audit: [] };
  for (const slice of SLICES) state[slice] = rows.get(slice);
  return state as unknown as GameState;
}

export abstract class Store {
  abstract readonly kind: StorageHealth["kind"];
  private readonly tracker = new SliceTracker();
  private pendingChanges: Changes = new Map();
  private pendingAudit: AuditEntry[] = [];
  private resetAuditTo: AuditEntry[] | null = null;
  private writing: Promise<void> | null = null;
  private failures = 0;
  private health: Omit<StorageHealth, "kind" | "pending"> = { ok: true, lastSavedAt: null, error: null };
  private listener: (() => void) | null = null;

  abstract load(): Promise<LoadedGame>;
  abstract auditForBackup(limit: number): Promise<string[]>;
  abstract putImage(id: string, type: string, data: Buffer): Promise<void>;
  abstract getImage(id: string): Promise<{ type: string; data: Buffer } | null>;
  abstract close(): Promise<void>;
  protected abstract write(changes: Changes, audit: AuditEntry[], resetAudit: boolean): Promise<void>;

  /** Called whenever saving starts failing or recovers, so staff screens can show it. */
  onHealthChange(listener: () => void): void {
    this.listener = listener;
  }

  status(): StorageHealth {
    const pending = this.pendingChanges.size > 0 || this.pendingAudit.length > 0 || this.writing !== null;
    return { kind: this.kind, pending, ...this.health };
  }

  /** Remember what was loaded so the first save only writes real changes. */
  primed(state: GameState): void {
    this.tracker.diff(state);
  }

  save(state: GameState): void {
    for (const [key, value] of this.tracker.diff(state)) this.pendingChanges.set(key, value);
    this.kick();
  }

  appendAudit(entries: AuditEntry[]): void {
    if (!entries.length) return;
    this.pendingAudit.push(...entries);
    this.kick();
  }

  /** Replace the whole audit log (used when restoring a backup). */
  resetAudit(entries: AuditEntry[]): void {
    this.resetAuditTo = entries;
    this.pendingAudit = [];
    this.kick();
  }

  /** Wait until everything queued so far is written (or has failed once). */
  async flush(): Promise<void> {
    while (this.writing) await this.writing;
    if (this.pendingChanges.size || this.pendingAudit.length || this.resetAuditTo) {
      this.kick();
      while (this.writing) await this.writing;
    }
  }

  private kick(): void {
    if (this.writing) return;
    this.writing = this.drain().finally(() => {
      this.writing = null;
      if (this.pendingChanges.size || this.pendingAudit.length || this.resetAuditTo) {
        const delay = this.failures ? RETRY_MS[Math.min(this.failures - 1, RETRY_MS.length - 1)]! : 0;
        setTimeout(() => this.kick(), delay);
      }
    });
  }

  private async drain(): Promise<void> {
    const changes = this.pendingChanges;
    const reset = this.resetAuditTo;
    const audit = reset ? [...reset, ...this.pendingAudit] : this.pendingAudit;
    this.pendingChanges = new Map();
    this.pendingAudit = [];
    this.resetAuditTo = null;
    try {
      await this.write(changes, audit, reset !== null);
      this.failures = 0;
      this.setHealth({ ok: true, lastSavedAt: Date.now(), error: null });
    } catch (error) {
      // Put the batch back underneath anything newer, then retry later.
      for (const [key, value] of changes) if (!this.pendingChanges.has(key)) this.pendingChanges.set(key, value);
      if (this.resetAuditTo === null) {
        // (A newer reset queued meanwhile replaces this batch's log entries entirely.)
        if (reset) {
          this.resetAuditTo = reset;
          this.pendingAudit = [...audit.slice(reset.length), ...this.pendingAudit];
        } else {
          this.pendingAudit = [...audit, ...this.pendingAudit];
        }
      }
      this.failures += 1;
      this.setHealth({ ...this.health, ok: false, error: error instanceof Error ? error.message : String(error) });
      console.error(`[store] save failed (attempt ${this.failures}):`, error);
    }
  }

  private setHealth(next: Omit<StorageHealth, "kind" | "pending">): void {
    const changed = next.ok !== this.health.ok;
    this.health = next;
    if (changed) this.listener?.();
  }
}

// ---------------------------------------------------------------- Postgres

/**
 * Connection settings for `pg`. With a CA certificate (Supabase lets you
 * download theirs), the server's identity is fully verified; any sslmode in
 * the URL is dropped because it would override that.
 */
export function postgresConfig(connectionString: string, caCert?: string): pg.PoolConfig {
  if (!caCert?.trim()) return { connectionString };
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), ssl: { ca: caCert.replace(/\\n/g, "\n"), rejectUnauthorized: true } };
}

/** Turns the usual database errors into a sentence that says what to change. */
export function explainDatabaseError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/self-signed certificate|unable to verify|certificate/i.test(message)) {
    return new Error(`${message}. Supabase uses its own certificate: end DATABASE_URL with ?sslmode=no-verify, or set DATABASE_CA_CERT to the certificate from Supabase's database settings.`);
  }
  // (Supabase's "tenant/user not found" also contains "ENOTFOUND", so check logins first.)
  if (/password authentication failed|tenant\/user/i.test(message)) {
    return new Error(`${message}. Check the user name and password inside DATABASE_URL.`);
  }
  if (/ENOTFOUND|getaddrinfo|ENETUNREACH/i.test(message)) {
    return new Error(`${message}. Check DATABASE_URL. For Supabase, use the "Session pooler" connection string: the direct one is IPv6-only and Render can't reach it.`);
  }
  return error instanceof Error ? error : new Error(message);
}

export class PostgresStore extends Store {
  readonly kind = "postgres" as const;
  private readonly pool: pg.Pool;
  private readonly images = new Map<string, { type: string; data: Buffer }>();

  constructor(connectionString: string, options: { maxConnections?: number; caCert?: string } = {}) {
    super();
    this.pool = new pg.Pool({
      ...postgresConfig(connectionString, options.caCert),
      max: options.maxConnections ?? 4,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
    });
    // Serverless Postgres closes idle connections now and then; the pool reconnects on next use.
    this.pool.on("error", (error) => console.error("[store] idle database connection closed:", error.message));
  }

  async load(): Promise<LoadedGame> {
    try {
      return await this.loadOnce();
    } catch (error) {
      throw explainDatabaseError(error);
    }
  }

  private async loadOnce(): Promise<LoadedGame> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cas_kv (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS cas_audit (seq bigserial PRIMARY KEY, entry text NOT NULL);
      CREATE TABLE IF NOT EXISTS cas_images (id text PRIMARY KEY, type text NOT NULL, data bytea NOT NULL);
    `);
    await this.pool.query("DELETE FROM cas_audit WHERE seq <= (SELECT max(seq) FROM cas_audit) - 5000");
    const kv = await this.pool.query<{ key: string; value: string }>("SELECT key, value FROM cas_kv");
    const rows = new Map(kv.rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
    const audit = await this.pool.query<{ entry: string }>("SELECT entry FROM cas_audit ORDER BY seq DESC LIMIT 200");
    return { state: assemble(rows), recentAudit: audit.rows.reverse().map((r) => JSON.parse(r.entry) as AuditEntry) };
  }

  protected async write(changes: Changes, audit: AuditEntry[], resetAudit: boolean): Promise<void> {
    const upserts = [...changes].filter(([, v]) => v !== null);
    const deletes = [...changes].filter(([, v]) => v === null).map(([k]) => k);
    const client = await this.pool.connect().catch((error: unknown) => {
      throw explainDatabaseError(error);
    });
    try {
      await client.query("BEGIN");
      if (upserts.length) {
        await client.query(
          `INSERT INTO cas_kv (key, value) SELECT * FROM unnest($1::text[], $2::text[])
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [upserts.map(([k]) => k), upserts.map(([, v]) => JSON.stringify(v))],
        );
      }
      if (deletes.length) await client.query("DELETE FROM cas_kv WHERE key = ANY($1::text[])", [deletes]);
      if (resetAudit) await client.query("DELETE FROM cas_audit");
      if (audit.length) await client.query("INSERT INTO cas_audit (entry) SELECT unnest($1::text[])", [audit.map((a) => JSON.stringify(a))]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw explainDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async auditForBackup(limit: number): Promise<string[]> {
    const result = await this.pool.query<{ entry: string }>("SELECT entry FROM (SELECT seq, entry FROM cas_audit ORDER BY seq DESC LIMIT $1) t ORDER BY seq", [limit]);
    return result.rows.map((r) => r.entry);
  }

  async putImage(id: string, type: string, data: Buffer): Promise<void> {
    await this.pool.query("INSERT INTO cas_images (id, type, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [id, type, data]);
    this.images.set(id, { type, data });
  }

  async getImage(id: string): Promise<{ type: string; data: Buffer } | null> {
    const cached = this.images.get(id);
    if (cached) return cached;
    const result = await this.pool.query<{ type: string; data: Buffer }>("SELECT type, data FROM cas_images WHERE id = $1", [id]);
    const row = result.rows[0] ?? null;
    if (row) this.images.set(id, row);
    return row;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ---------------------------------------------------------------- local folder (or memory)

// Slice keys like "board:abc" contain ":", which Windows file names can't.
const keyToFile = (key: string) => `${key.replace(/:/g, "__")}.json`;
const fileToKey = (file: string) => file.slice(0, -".json".length).replace(/__/g, ":");

/**
 * For running on a laptop. With a folder the game survives restarts; with
 * `null` everything stays in memory (used by tests).
 */
export class FileStore extends Store {
  readonly kind: "file" | "memory";
  private snapshot: Map<string, unknown> = new Map();
  private auditLines: string[] = [];
  private readonly images = new Map<string, { type: string; data: Buffer }>();

  constructor(private readonly dir: string | null) {
    super();
    this.kind = dir ? "file" : "memory";
  }

  async load(): Promise<LoadedGame> {
    if (this.dir) {
      await mkdir(join(this.dir, "images"), { recursive: true });
      await mkdir(join(this.dir, "slices"), { recursive: true });
      for (const name of await readdir(join(this.dir, "slices"))) {
        if (!name.endsWith(".json")) continue;
        const raw = await readFile(join(this.dir, "slices", name), "utf8");
        this.snapshot.set(fileToKey(name), JSON.parse(raw) as unknown);
      }
      const lines = await readFile(join(this.dir, "audit.jsonl"), "utf8").catch(() => "");
      this.auditLines = lines.split("\n").filter(Boolean);
    }
    return { state: assemble(this.snapshot), recentAudit: this.auditLines.slice(-200).map((l) => JSON.parse(l) as AuditEntry) };
  }

  /** One file per slice, so a change rewrites only what changed. */
  protected async write(changes: Changes, audit: AuditEntry[], resetAudit: boolean): Promise<void> {
    for (const [key, value] of changes) {
      if (value === null) this.snapshot.delete(key);
      else this.snapshot.set(key, value);
    }
    const lines = audit.map((a) => JSON.stringify(a));
    this.auditLines = resetAudit ? lines : [...this.auditLines, ...lines];
    if (!this.dir) return;
    for (const [key, value] of changes) {
      const file = join(this.dir, "slices", keyToFile(key));
      if (value === null) {
        await rm(file, { force: true });
        continue;
      }
      await writeFile(`${file}.tmp`, JSON.stringify(value));
      await rename(`${file}.tmp`, file);
    }
    if (resetAudit) await writeFile(join(this.dir, "audit.jsonl"), lines.map((l) => `${l}\n`).join(""));
    else if (lines.length) await appendFile(join(this.dir, "audit.jsonl"), lines.map((l) => `${l}\n`).join(""));
  }

  async auditForBackup(limit: number): Promise<string[]> {
    return this.auditLines.slice(-limit);
  }

  async putImage(id: string, type: string, data: Buffer): Promise<void> {
    this.images.set(id, { type, data });
    if (this.dir) await writeFile(join(this.dir, "images", id), JSON.stringify({ type, data: data.toString("base64") }));
  }

  async getImage(id: string): Promise<{ type: string; data: Buffer } | null> {
    const cached = this.images.get(id);
    if (cached || !this.dir) return cached ?? null;
    const raw = await readFile(join(this.dir, "images", id), "utf8").catch(() => null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { type: string; data: string };
    const image = { type: parsed.type, data: Buffer.from(parsed.data, "base64") };
    this.images.set(id, image);
    return image;
  }

  async close(): Promise<void> {}
}
