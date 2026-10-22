// The live game. One Durable Object holds the whole event: state on disk,
// every phone, projector and admin connected over WebSockets, and an alarm
// that locks rounds when the clock runs out.

import { DurableObject } from "cloudflare:workers";
import type { Action, ClientMessage, Presence, ServerMessage } from "../shared/protocol";
import type { GameState, Role } from "../shared/types";
import { GameError, applyAction, registerTeam } from "./game/actions";
import { createInitialState, restoreState, tick, timerRunning } from "./game/state";
import { newId, normalizeCode } from "./game/util";
import { buildContext, publicView, staffView, teamView } from "./game/views";
import { Limiter, secretMatches } from "./auth";

interface Attachment {
  role: Role | null;
  teamId: string | null;
  ip: string;
}

const STATE_KEY = "state";
const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_BACKUP_BYTES = 4_000_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const KICKED = 4001;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function errorMessage(error: unknown): string {
  return error instanceof GameError || error instanceof Error ? error.message : "Something went wrong.";
}

export class GameRoom extends DurableObject<Env> {
  private state: GameState = createInitialState(Date.now());
  private readonly loginLimiter = new Limiter(10);
  private readonly registerLimiter = new Limiter(6, 10 * 60_000);
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<GameState>(STATE_KEY);
      if (saved) this.state = restoreState(saved, saved.updatedAt);
    });
  }

  // ------------------------------------------------------------ HTTP

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";

    try {
      if (path === "/api/ws") return this.upgrade(request, ip);
      if (path === "/api/public" && request.method === "GET") return json(this.publicInfo());
      if (path === "/api/register" && request.method === "POST") return await this.register(request, ip);
      if (path.startsWith("/api/img/") && request.method === "GET") return await this.image(path.slice("/api/img/".length));
      if (path.startsWith("/api/admin/")) {
        if (!(await this.isAdminRequest(request, ip))) return json({ error: "Wrong admin password." }, 401);
        if (path === "/api/admin/upload" && request.method === "POST") return await this.upload(request);
        if (path === "/api/admin/backup" && request.method === "GET") return this.backup();
        if (path === "/api/admin/restore" && request.method === "POST") return await this.restore(request);
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      return json({ error: errorMessage(error) }, error instanceof GameError ? 400 : 500);
    }
  }

  private upgrade(request: Request, ip: string): Response {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Expected a WebSocket." }, 426);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, teamId: null, ip } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private publicInfo() {
    const { event, rounds, teams, live } = this.state;
    return {
      event,
      teamCount: teams.length,
      stage: live.stage,
      rounds: (["r1", "r2", "r3", "r4", "finale"] as const).map((id) => ({
        id,
        codename: rounds[id].codename,
        title: rounds[id].title,
        tagline: rounds[id].tagline,
        durationSec: rounds[id].durationSec,
      })),
    };
  }

  private async register(request: Request, ip: string): Promise<Response> {
    const now = Date.now();
    if (this.registerLimiter.blocked(ip, now)) return json({ error: "Too many sign-ups from this network. Try again in a few minutes." }, 429);
    const body = await this.readJson(request, 16_000);
    // Hidden form field that real people never fill in.
    if (typeof (body as Record<string, unknown>)?.website === "string" && (body as Record<string, string>).website) {
      return json({ error: "Registration failed." }, 400);
    }
    const { state, team } = registerTeam(this.state, body, now);
    this.registerLimiter.record(ip, now);
    await this.commit(state);
    return json({ ok: true, team: { name: team.name, emoji: team.emoji, code: team.code } });
  }

  private async image(id: string): Promise<Response> {
    if (!/^[a-z0-9]{10}$/.test(id)) return new Response("Not found", { status: 404 });
    const stored = await this.ctx.storage.get<{ type: string; data: ArrayBuffer }>(`img:${id}`);
    if (!stored) return new Response("Not found", { status: 404 });
    return new Response(stored.data, {
      headers: { "Content-Type": stored.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  }

  private async upload(request: Request): Promise<Response> {
    const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
    if (!IMAGE_TYPES.includes(type)) return json({ error: "Upload a JPEG, PNG, WebP or GIF image." }, 415);
    const data = await request.arrayBuffer();
    if (data.byteLength > MAX_IMAGE_BYTES) return json({ error: "That image is too big. Keep it under 1.5 MB." }, 413);
    const id = newId();
    await this.ctx.storage.put(`img:${id}`, { type, data });
    return json({ ok: true, id });
  }

  private backup(): Response {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return new Response(JSON.stringify(this.state, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ctrl-alt-steal-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  private async restore(request: Request): Promise<Response> {
    const restored = restoreState(await this.readJson(request, MAX_BACKUP_BYTES), Date.now());
    restored.audit = [...restored.audit, { id: newId(), at: Date.now(), by: "admin", type: "game.restore", summary: "Restored from a backup file" }];
    await this.commit(restored);
    return json({ ok: true });
  }

  private async isAdminRequest(request: Request, ip: string): Promise<boolean> {
    const now = Date.now();
    if (this.loginLimiter.blocked(ip, now)) return false;
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const ok = await secretMatches(token, this.env.ADMIN_PASSWORD);
    if (!ok) this.loginLimiter.record(ip, now);
    return ok;
  }

  private async readJson(request: Request, maxBytes: number): Promise<unknown> {
    const text = await request.text();
    if (text.length > maxBytes) throw new GameError("That request is too large.");
    try {
      return JSON.parse(text);
    } catch {
      throw new GameError("That file is not valid JSON.");
    }
  }

  // ------------------------------------------------------------ WebSockets

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    const attachment = ws.deserializeAttachment() as Attachment;
    if (message.t === "hello") await this.hello(ws, attachment, message);
    else if (message.t === "act") await this.act(ws, attachment, message.id, message.action);
    else if (message.t === "ping") this.send(ws, { t: "pong", serverNow: Date.now() });
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "Closing");
    } catch {
      // Already closed.
    }
    this.schedulePresence();
  }

  async webSocketError(): Promise<void> {
    this.schedulePresence();
  }

  private async hello(ws: WebSocket, attachment: Attachment, message: Extract<ClientMessage, { t: "hello" }>): Promise<void> {
    const now = Date.now();
    const deny = (reason: string) => this.send(ws, { t: "denied", reason });
    if (message.role === "screen") return this.welcome(ws, { ...attachment, role: "screen", teamId: null });

    if (this.loginLimiter.blocked(attachment.ip, now)) return deny("Too many wrong attempts. Wait a few minutes and try again.");

    if (message.role === "team") {
      const code = normalizeCode(String(message.code ?? ""));
      const team = this.state.teams.find((t) => t.code === code);
      if (!team) {
        this.loginLimiter.record(attachment.ip, now);
        return deny("That team code is not on our list. Check your code card.");
      }
      return this.welcome(ws, { ...attachment, role: "team", teamId: team.id });
    }

    if (message.role === "admin" || message.role === "volunteer") {
      const secret = message.role === "admin" ? this.env.ADMIN_PASSWORD : this.env.VOLUNTEER_PASSWORD;
      if (!secret) return deny(`The ${message.role} password is not set on the server yet.`);
      if (!(await secretMatches(String(message.password ?? ""), secret))) {
        this.loginLimiter.record(attachment.ip, now);
        return deny("Wrong password.");
      }
      return this.welcome(ws, { ...attachment, role: message.role, teamId: null });
    }
    deny("Unknown role.");
  }

  private welcome(ws: WebSocket, attachment: Attachment): void {
    ws.serializeAttachment(attachment);
    this.send(ws, { t: "welcome", role: attachment.role!, teamId: attachment.teamId });
    // Everyone's presence changed, so refresh all screens (debounced).
    this.schedulePresence();
    this.sendState(ws, attachment);
  }

  private async act(ws: WebSocket, attachment: Attachment, id: string, action: Action): Promise<void> {
    if (!attachment.role || attachment.role === "screen") {
      this.send(ws, { t: "ack", id, ok: false, error: "Sign in first." });
      return;
    }
    try {
      const result = applyAction(this.state, action, { role: attachment.role, teamId: attachment.teamId }, Date.now());
      await this.commit(result.state);
      this.send(ws, { t: "ack", id, ok: true });
      if (result.kickTeams.length) this.kick(result.kickTeams);
    } catch (error) {
      this.send(ws, { t: "ack", id, ok: false, error: errorMessage(error) });
    }
  }

  private kick(teamIds: string[]): void {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (a.role === "team" && a.teamId && teamIds.includes(a.teamId)) {
        try {
          ws.close(KICKED, "Your team code changed. Sign in again.");
        } catch {
          // Already closed.
        }
      }
    }
  }

  // ------------------------------------------------------------ alarm

  async alarm(): Promise<void> {
    const next = tick(this.state, Date.now());
    if (next) await this.commit(next);
    else await this.syncAlarm();
  }

  private async syncAlarm(): Promise<void> {
    const { timer, stage, roundId } = this.state.live;
    const needed = timerRunning(timer) && stage === "round" && roundId !== null && this.state.status[roundId] === "open";
    if (needed) await this.ctx.storage.setAlarm(timer.endsAt!);
    else await this.ctx.storage.deleteAlarm();
  }

  // ------------------------------------------------------------ state

  /** Persist first, then tell everyone. */
  private async commit(next: GameState): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, next);
    this.state = next;
    await this.syncAlarm();
    this.broadcast();
  }

  private presence(sockets: WebSocket[]): Presence {
    const presence: Presence = { screens: 0, staff: 0, teams: {} };
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a?.role || ws.readyState !== WebSocket.READY_STATE_OPEN) continue;
      if (a.role === "screen") presence.screens++;
      else if (a.role === "team" && a.teamId) presence.teams[a.teamId] = (presence.teams[a.teamId] ?? 0) + 1;
      else presence.staff++;
    }
    return presence;
  }

  private schedulePresence(): void {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      this.broadcast();
    }, 750);
  }

  private broadcast(): void {
    const sockets = this.ctx.getWebSockets();
    const ctx = buildContext(this.state, this.presence(sockets));
    const shared = publicView(this.state, ctx);
    const cache = new Map<string, string | null>();
    const serverNow = Date.now();

    for (const ws of sockets) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a?.role) continue;
      const key = a.role === "team" ? `team:${a.teamId}` : a.role;
      if (!cache.has(key)) {
        const view = a.role === "screen" ? shared
          : a.role === "team" ? teamView(this.state, ctx, a.teamId!, shared)
          : staffView(this.state, ctx, a.role, shared);
        cache.set(key, view ? JSON.stringify({ t: "state", view, serverNow } satisfies ServerMessage) : null);
      }
      const message = cache.get(key);
      if (message) this.trySend(ws, message);
    }
  }

  private sendState(ws: WebSocket, a: Attachment): void {
    const ctx = buildContext(this.state, this.presence(this.ctx.getWebSockets()));
    const view = a.role === "team" ? teamView(this.state, ctx, a.teamId!)
      : a.role === "admin" || a.role === "volunteer" ? staffView(this.state, ctx, a.role)
      : publicView(this.state, ctx);
    if (view) this.send(ws, { t: "state", view, serverNow: Date.now() });
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    this.trySend(ws, JSON.stringify(message));
  }

  private trySend(ws: WebSocket, message: string): void {
    try {
      ws.send(message);
    } catch {
      // The socket closed between listing and sending; presence will catch up.
    }
  }
}
