// The HTTP side of the game server: /api routes, the /api/ws WebSocket, CORS
// for the website's origin, and (in laptop mode) the built website itself.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { GameError } from "./game/actions";
import { HttpError, type GameServer } from "./game-server";

const MAX_JSON_BYTES = 16_000;
const MAX_BACKUP_BYTES = 4_000_000;
const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface AppOptions {
  /** Website origins allowed to call the API, e.g. https://ctrl-alt-steal.vercel.app. Empty allows any. */
  allowedOrigins: string[];
  /** Folder with the built website to serve too, or null for API only. */
  clientDir: string | null;
}

export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function createApp(game: GameServer, options: AppOptions): Server {
  const clientDir = options.clientDir ? resolve(options.clientDir) : null;

  function originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin || !options.allowedOrigins.length || options.allowedOrigins.includes(origin)) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : error instanceof GameError ? 400 : 500;
      if (status === 500) console.error("[http]", req.method, req.url, error);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? "Something went wrong." : (error as Error).message });
      else res.end();
    });
  });

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? "/", "http://local").pathname;
    const method = req.method ?? "GET";
    const ip = clientIp(req);
    if (req.headers.origin && originAllowed(req)) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      res.setHeader("Access-Control-Max-Age", "600");
    }

    if (method === "OPTIONS") {
      res.writeHead(204);
      return void res.end();
    }
    if (path === "/api/health" && (method === "GET" || method === "HEAD")) return sendJson(res, game.ready ? 200 : 503, game.health());
    // Until the saved game is loaded, nothing else may run: an empty game must never overwrite it.
    if (path.startsWith("/api/") && !game.ready) return sendJson(res, 503, { error: "The game server is starting up. Try again in a moment." });
    if (path === "/api/public" && method === "GET") return sendJson(res, 200, game.publicInfo());
    if (path === "/api/register" && method === "POST") return sendJson(res, 200, game.register(await readJson(req, MAX_JSON_BYTES), ip));
    if (path.startsWith("/api/img/") && method === "GET") {
      const image = await game.image(path.slice("/api/img/".length));
      if (!image) return sendJson(res, 404, { error: "Not found." });
      res.writeHead(200, { "Content-Type": image.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
      return void res.end(image.data);
    }
    if (path.startsWith("/api/admin/")) {
      const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (!game.isAdmin(token, ip)) return sendJson(res, 401, { error: "Wrong admin password." });
      if (path === "/api/admin/upload" && method === "POST") {
        const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim();
        if (!IMAGE_TYPES.includes(type)) return sendJson(res, 415, { error: "Upload a JPEG, PNG, WebP or GIF image." });
        return sendJson(res, 200, await game.upload(type, await readBody(req, MAX_IMAGE_BYTES, "That image is too big. Keep it under 1.5 MB.")));
      }
      if (path === "/api/admin/backup" && method === "GET") {
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        res.writeHead(200, { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ctrl-alt-steal-backup-${stamp}.json"`, "Cache-Control": "no-store" });
        return void res.end(await game.backup());
      }
      if (path === "/api/admin/restore" && method === "POST") {
        game.restore(await readJson(req, MAX_BACKUP_BYTES));
        return sendJson(res, 200, { ok: true });
      }
    }
    if (path.startsWith("/api/")) return sendJson(res, 404, { error: "Not found." });
    if (clientDir && (method === "GET" || method === "HEAD") && (await serveClient(clientDir, req, res))) return;
    sendJson(res, 404, { error: "Not found." });
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://local").pathname;
    if (path !== "/api/ws" || !originAllowed(req)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      return void socket.destroy();
    }
    if (!game.ready) {
      // Phones retry on their own a moment later.
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      return void socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => game.connect(ws, clientIp(req)));
  });

  return server;
}

// ---------------------------------------------------------------- helpers

function clientIp(req: IncomingMessage): string {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage, maxBytes: number, tooBig: string): Promise<Buffer> {
  if (Number(req.headers["content-length"] ?? 0) > maxBytes) throw new HttpError(413, tooBig);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      req.destroy();
      throw new HttpError(413, tooBig);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const body = await readBody(req, maxBytes, "That request is too large.");
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "That is not valid JSON.");
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

/** Serves the built website, with the single-page-app fallback to index.html. */
async function serveClient(root: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
  const wanted = normalize(join(root, pathname));
  // Stay inside the folder: "dist-server" must not match "dist".
  if (wanted !== root && !wanted.startsWith(root + sep)) return false;
  const info = await stat(wanted).catch(() => null);
  const file = info?.isFile() ? wanted : join(root, "index.html");
  const body = await readFile(file).catch(() => null);
  if (!body) return false;
  res.writeHead(200, {
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}
