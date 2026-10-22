// The live game: one process holds the whole event in memory, talks to every
// phone, projector and admin over WebSockets, saves every change through the
// store, and locks rounds when their timer runs out.

import type { WebSocket } from "ws";
import type { Action, ClientMessage, Presence, PublicInfo, ServerMessage } from "../shared/protocol";
import { ROUND_IDS, type AuditEntry, type GameState, type Role } from "../shared/types";
import { Limiter, secretMatches } from "./auth";
import { GameError, applyAction, registerTeam } from "./game/actions";
import { Broadcaster, type Connection } from "./game/broadcast";
import { AUDIT_LIMIT, createInitialState, restoreState, tick, timerRunning } from "./game/state";
import { newId, normalizeCode } from "./game/util";
import type { Store } from "./store";

export interface Secrets {
  adminPassword: string | undefined;
  volunteerPassword: string | undefined;
}

interface Conn {
  ws: WebSocket;
  ip: string;
  role: Role | null;
  teamId: string | null;
  alive: boolean;
  tokens: number;
  tokensAt: number;
}

const MAX_MESSAGE_BYTES = 512 * 1024;
const KICKED = 4001;
/** Players and volunteers: sustained actions per second, and the burst allowed on top. */
const ACT_RATE = 5;
const ACT_BURST = 20;
/** Changes inside this window go out as one update (unnoticeable to players, fewer broadcasts under load). */
const BATCH_MS = 100;
/** Phones connecting and leaving only refresh "online" dots, so they can wait longer. */
const PRESENCE_MS = 750;
const HEARTBEAT_MS = 30_000;
const AUDIT_RECENT = 200;

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export class GameServer {
  private state: GameState = createInitialState(Date.now());
  private recentAudit: AuditEntry[] = [];
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly broadcaster = new Broadcaster();
  // Every phone on campus Wi-Fi shares one public IP, so these limits are per IP
  // but generous for team codes (typos are common, guessing 31^6 codes is not),
  // and staff password guesses are counted separately so they can't lock teams out.
  private readonly codeLimiter = new Limiter(120);
  private readonly staffLimiter = new Limiter(15);
  private readonly registerLimiter = new Limiter(40, 10 * 60_000);
  private broadcastTimer: NodeJS.Timeout | null = null;
  private broadcastDue = 0;
  private roundTimer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly store: Store, private readonly secrets: Secrets) {}

  async start(): Promise<void> {
    const loaded = await this.store.load();
    if (loaded.state) this.state = restoreState(loaded.state, loaded.state.updatedAt);
    this.state = { ...this.state, audit: [] };
    this.recentAudit = loaded.recentAudit;
    if (loaded.state) this.store.primed(this.state);
    else this.store.save(this.state);
    this.store.onHealthChange(() => this.scheduleBroadcast(0));
    this.armRoundTimer();
    // A round that should have locked while the server was down locks now.
    const next = tick(this.state, Date.now());
    if (next) this.commit(next);
    this.heartbeat = setInterval(() => this.checkHeartbeats(), HEARTBEAT_MS);
  }

  /** Stop cleanly: tell phones to reconnect, then make sure every change is saved. */
  async shutdown(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    for (const conn of this.conns.values()) conn.ws.close(1012, "Server restarting");
    await this.store.flush();
  }

  // ------------------------------------------------------------ HTTP

  /** Also reports total CPU time used, so a load test can measure how busy the server really is. */
  health() {
    const cpu = process.cpuUsage();
    return {
      ok: true,
      storage: this.store.status(),
      connections: this.conns.size,
      cpuMs: Math.round((cpu.user + cpu.system) / 1000),
      uptimeMs: Math.round(process.uptime() * 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1_048_576),
    };
  }

  /** Teaser data for the landing page. Suspect traits and bios stay for the briefing. */
  publicInfo(): PublicInfo {
    const { event, rounds, teams, live, caseFile } = this.state;
    return {
      event,
      teamCount: teams.length,
      stage: live.stage,
      modelName: caseFile.modelName,
      story: caseFile.story,
      facts: caseFile.facts,
      suspects: caseFile.suspects.map(({ id, name, alias, role, emoji }) => ({ id, name, alias, role, emoji })),
      rounds: ROUND_IDS.map((id) => ({ id, codename: rounds[id].codename, title: rounds[id].title, tagline: rounds[id].tagline, durationSec: rounds[id].durationSec })),
    };
  }

  register(body: unknown, ip: string) {
    const now = Date.now();
    if (this.registerLimiter.blocked(ip, now)) throw new HttpError(429, "Too many sign-ups from this network. Try again in a few minutes.");
    this.registerLimiter.record(ip, now);
    // Hidden form field that real people never fill in.
    const website = (body as Record<string, unknown> | null)?.website;
    if (typeof website === "string" && website) throw new HttpError(400, "Registration failed.");
    const { state, team } = registerTeam(this.state, body, now);
    this.commit(state);
    return { ok: true as const, team: { name: team.name, emoji: team.emoji, code: team.code } };
  }

  image(id: string) {
    return /^[a-z0-9]{10}$/.test(id) ? this.store.getImage(id) : Promise.resolve(null);
  }

  isAdmin(token: string, ip: string): boolean {
    const now = Date.now();
    if (this.staffLimiter.blocked(ip, now)) return false;
    const ok = secretMatches(token, this.secrets.adminPassword);
    if (!ok) this.staffLimiter.record(ip, now);
    return ok;
  }

  async upload(type: string, data: Buffer): Promise<{ ok: true; id: string }> {
    const id = newId();
    await this.store.putImage(id, type, data);
    return { ok: true, id };
  }

  /** A backup is the current state plus the most recent audit log, as one JSON document. */
  async backup(): Promise<string> {
    const entries = await this.store.auditForBackup(AUDIT_LIMIT);
    const { audit: _audit, ...rest } = this.state;
    return `${JSON.stringify(rest).slice(0, -1)},"audit":[${entries.join(",")}]}`;
  }

  restore(body: unknown): void {
    const restored = restoreState(body, Date.now());
    const audit = [...restored.audit.slice(-AUDIT_RECENT), { id: newId(), at: Date.now(), by: "admin" as const, type: "game.restore", summary: "Restored from a backup file" }];
    this.store.resetAudit(audit);
    this.recentAudit = audit;
    this.commit({ ...restored, audit: [] });
    // Phones signed in as a crew that isn't in the backup have to sign in again.
    const known = new Set(restored.teams.map((t) => t.id));
    for (const conn of this.conns.values()) {
      if (conn.role === "team" && conn.teamId && !known.has(conn.teamId)) conn.ws.close(KICKED, "The game was restored. Sign in again.");
    }
  }

  // ------------------------------------------------------------ WebSockets

  connect(ws: WebSocket, ip: string): void {
    const conn: Conn = { ws, ip, role: null, teamId: null, alive: true, tokens: ACT_BURST, tokensAt: Date.now() };
    this.conns.set(ws, conn);
    ws.on("pong", () => (conn.alive = true));
    ws.on("message", (data, isBinary) => {
      conn.alive = true;
      if (isBinary) return;
      const raw = data.toString();
      if (raw === "ping") return ws.send("pong");
      if (raw.length > MAX_MESSAGE_BYTES) return;
      this.onMessage(conn, raw);
    });
    ws.on("close", () => {
      this.conns.delete(ws);
      this.scheduleBroadcast(PRESENCE_MS);
    });
    ws.on("error", () => ws.terminate());
  }

  private onMessage(conn: Conn, raw: string): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.t === "hello") this.hello(conn, message);
    else if (message.t === "act" && message.action && typeof message.action === "object") this.act(conn, String(message.id).slice(0, 40), message.action);
    else if (message.t === "ping") this.send(conn, { t: "pong", serverNow: Date.now() });
  }

  private hello(conn: Conn, message: Extract<ClientMessage, { t: "hello" }>): void {
    const now = Date.now();
    const deny = (reason: string) => this.send(conn, { t: "denied", reason });
    const tooMany = "Too many wrong attempts from this network. Wait a few minutes and try again.";
    if (message.role === "screen") return this.welcome(conn, "screen", null);

    if (message.role === "team") {
      if (this.codeLimiter.blocked(conn.ip, now)) return deny(tooMany);
      const code = normalizeCode(String(message.code ?? ""));
      const team = this.state.teams.find((t) => t.code === code);
      if (!team) {
        this.codeLimiter.record(conn.ip, now);
        return deny("That team code is not on our list. Check your code card.");
      }
      return this.welcome(conn, "team", team.id);
    }

    if (message.role === "admin" || message.role === "volunteer") {
      if (this.staffLimiter.blocked(conn.ip, now)) return deny(tooMany);
      const secret = message.role === "admin" ? this.secrets.adminPassword : this.secrets.volunteerPassword;
      if (!secret) return deny(`The ${message.role} password is not set on the server yet.`);
      if (!secretMatches(String(message.password ?? ""), secret)) {
        this.staffLimiter.record(conn.ip, now);
        return deny("Wrong password.");
      }
      return this.welcome(conn, message.role, null);
    }
    deny("Unknown role.");
  }

  private welcome(conn: Conn, role: Role, teamId: string | null): void {
    conn.role = role;
    conn.teamId = teamId;
    this.send(conn, { t: "welcome", role, teamId });
    const snapshot = this.broadcaster.snapshot(this.viewState(), this.presence(), { id: conn.ws, recipient: { role, teamId } }, Date.now());
    if (snapshot && conn.ws.readyState === conn.ws.OPEN) conn.ws.send(snapshot);
    this.scheduleBroadcast(PRESENCE_MS);
  }

  private act(conn: Conn, id: string, action: Action): void {
    if (!conn.role || conn.role === "screen") return this.send(conn, { t: "ack", id, ok: false, error: "Sign in first." });
    if (conn.role !== "admin" && !this.allow(conn)) return this.send(conn, { t: "ack", id, ok: false, error: "Slow down a little and try again." });
    try {
      const result = applyAction(this.state, action, { role: conn.role, teamId: conn.teamId }, Date.now());
      this.commit(result.state);
      this.send(conn, { t: "ack", id, ok: true });
      if (result.kickTeams.length) this.kick(result.kickTeams);
    } catch (error) {
      if (!(error instanceof GameError)) console.error("[game] action failed:", action.type, error);
      this.send(conn, { t: "ack", id, ok: false, error: errorMessage(error) });
    }
  }

  /** Token bucket per connection, so one scripted phone can't slow the room for everyone. */
  private allow(conn: Conn): boolean {
    const now = Date.now();
    conn.tokens = Math.min(ACT_BURST, conn.tokens + ((now - conn.tokensAt) / 1000) * ACT_RATE);
    conn.tokensAt = now;
    if (conn.tokens < 1) return false;
    conn.tokens -= 1;
    return true;
  }

  private kick(teamIds: string[]): void {
    for (const conn of this.conns.values()) {
      if (conn.role === "team" && conn.teamId && teamIds.includes(conn.teamId)) conn.ws.close(KICKED, "Your team code changed. Sign in again.");
    }
  }

  /** Drops phones that vanished without saying goodbye (screen off, lost signal). */
  private checkHeartbeats(): void {
    for (const conn of this.conns.values()) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
  }

  // ------------------------------------------------------------ state

  /** Keep the new state, queue it for saving, re-arm the round timer and tell everyone. */
  private commit(next: GameState): void {
    const fresh = next.audit;
    this.state = fresh.length ? { ...next, audit: [] } : next;
    this.store.save(this.state);
    if (fresh.length) {
      this.store.appendAudit(fresh);
      this.recentAudit = [...this.recentAudit, ...fresh].slice(-AUDIT_RECENT);
    }
    this.armRoundTimer();
    this.scheduleBroadcast(BATCH_MS);
  }

  private armRoundTimer(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
    const { timer, stage, roundId } = this.state.live;
    if (!timerRunning(timer) || stage !== "round" || !roundId || this.state.status[roundId] !== "open") return;
    this.roundTimer = setTimeout(() => {
      this.roundTimer = null;
      const next = tick(this.state, Date.now());
      if (next) this.commit(next);
      else this.armRoundTimer();
    }, Math.max(0, timer.endsAt! - Date.now()) + 25);
  }

  /** The state as screens should see it, with the recent audit log put back in. */
  private viewState(): GameState {
    return this.recentAudit.length ? { ...this.state, audit: this.recentAudit } : this.state;
  }

  private presence(): Presence {
    const presence: Presence = { screens: 0, staff: 0, teams: {}, storage: this.store.status() };
    for (const conn of this.conns.values()) {
      if (conn.role === "screen") presence.screens++;
      else if (conn.role === "team" && conn.teamId) presence.teams[conn.teamId] = (presence.teams[conn.teamId] ?? 0) + 1;
      else if (conn.role) presence.staff++;
    }
    return presence;
  }

  /** Runs one broadcast within `delayMs`, merging every change made in the meantime. */
  private scheduleBroadcast(delayMs: number): void {
    const due = Date.now() + delayMs;
    if (this.broadcastTimer && this.broadcastDue <= due) return;
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastDue = due;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.broadcast();
    }, delayMs);
  }

  private broadcast(): void {
    const connections: Connection[] = [];
    for (const conn of this.conns.values()) if (conn.role) connections.push({ id: conn.ws, recipient: { role: conn.role, teamId: conn.teamId } });
    const messages = this.broadcaster.changed(this.viewState(), this.presence(), connections, Date.now());
    for (const [id, message] of messages) {
      const ws = id as WebSocket;
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  }

  private send(conn: Conn, message: ServerMessage): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(message));
  }
}
