// Live connection to the game room. Reconnects on its own, keeps the clock
// in sync with the server, and turns actions into promises that resolve
// when the server confirms them.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Action, ClientMessage, ServerMessage, View } from "../../shared/protocol";
import type { Role } from "../../shared/types";

export type Hello = Extract<ClientMessage, { t: "hello" }>;
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "denied" | "kicked";

export interface Snapshot {
  status: ConnectionStatus;
  view: View | null;
  role: Role | null;
  error: string | null;
  /** serverTime ≈ Date.now() + offset */
  offset: number;
}

const ACK_TIMEOUT_MS = 10_000;
const PING_MS = 20_000;

export class GameClient {
  private ws: WebSocket | null = null;
  private snapshot: Snapshot = { status: "connecting", view: null, role: null, error: null, offset: 0 };
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: number }>();
  private retries = 0;
  private stopped = false;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private seq = 0;

  constructor(private readonly hello: Hello) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    this.ws?.close(1000, "bye");
    this.ws = null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  act(action: Action): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.snapshot.status !== "live") {
      return Promise.reject(new Error("Not connected. Trying to reconnect…"));
    }
    const id = `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("The server did not answer. Check your connection."));
      }, ACK_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ t: "act", id, action } satisfies ClientMessage));
    });
  }

  private set(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private open(): void {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify(this.hello));
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), PING_MS);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") return;
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.receive(message);
    };

    ws.onclose = (event) => {
      window.clearInterval(this.pingTimer);
      this.failPending("Connection lost.");
      if (this.ws !== ws || this.stopped) return;
      if (event.code === 4001) {
        this.set({ status: "kicked", error: event.reason || "Please sign in again." });
        return;
      }
      if (this.snapshot.status === "denied") return;
      this.set({ status: "reconnecting" });
      const delay = Math.min(8000, 600 * 2 ** this.retries++);
      this.retryTimer = window.setTimeout(() => this.open(), delay);
    };
  }

  private receive(message: ServerMessage): void {
    switch (message.t) {
      case "welcome":
        this.retries = 0;
        this.set({ status: "live", role: message.role, error: null });
        return;
      case "denied":
        this.set({ status: "denied", error: message.reason });
        this.ws?.close(1000, "denied");
        return;
      case "state":
        this.set({ view: message.view, offset: message.serverNow - Date.now() });
        return;
      case "pong":
        this.set({ offset: message.serverNow - Date.now() });
        return;
      case "ack": {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.ok) pending.resolve();
        else pending.reject(new Error(message.error ?? "That did not work."));
      }
    }
  }

  private failPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}

/** Connects while mounted. Pass null to stay disconnected (e.g. before login). */
export function useGame(hello: Hello | null) {
  const key = hello ? JSON.stringify(hello) : "";
  const client = useMemo(() => (hello ? new GameClient(hello) : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    client?.start();
    return () => client?.stop();
  }, [client]);

  const snapshot = useSyncExternalStore(
    client?.subscribe ?? noopSubscribe,
    client?.getSnapshot ?? idleSnapshot,
  );
  const act = useMemo(() => (client ? (action: Action) => client.act(action) : rejectAct), [client]);
  return { ...snapshot, act };
}

const IDLE: Snapshot = { status: "connecting", view: null, role: null, error: null, offset: 0 };
const noopSubscribe = () => () => {};
const idleSnapshot = () => IDLE;
const rejectAct = () => Promise.reject(new Error("Not connected."));

export type Act = (action: Action) => Promise<void>;
