// Turns the game state into messages for every connected screen, sending
// only the sections of each view that changed since that connection last
// heard from us. A crew auto-saving sends a 2–3 KB update to its own phones
// instead of a full copy of the game to everyone.
//
// A connection gets a full `state` message when it signs in, then `patch`
// messages holding just the changed top-level sections (and, for staff, the
// changed parts of `staff`). The client merges patches in. What each
// connection has is tracked per connection, so a wave of reconnects never
// forces a resend to everyone else.

import type { Presence } from "../../shared/protocol";
import type { GameState, Role } from "../../shared/types";
import { buildContext, publicView, staffView, teamMe, type ViewContext } from "./views";

export interface Recipient {
  role: Role;
  teamId: string | null;
}

/** Any object that identifies one connection (the WebSocket itself in production). */
export type ConnectionId = object;

export interface Connection {
  id: ConnectionId;
  recipient: Recipient;
}

export function recipientKey(r: Recipient): string {
  return r.role === "team" ? `team:${r.teamId}` : r.role;
}

/** Section name -> JSON. Names starting with "staff." live inside the `staff` object. */
type Sections = Record<string, string>;

interface Prepared {
  state: GameState;
  ctx: ViewContext;
  shared: ReturnType<typeof publicView>;
  sharedSections: Sections;
  /** Staff sections that are the same for admins and volunteers, built at most once. */
  staffCommon?: Sections;
}

const STAFF_PREFIX = "staff.";

export class Broadcaster {
  /** What each connection was last sent. */
  private readonly sent = new WeakMap<ConnectionId, Sections>();
  /**
   * The latest sections per kind of screen. Unchanged sections keep the very
   * same string object, so comparing against `sent` is a pointer check.
   */
  private readonly latest = new Map<string, Sections>();

  /** A patch for every connection whose view changed. */
  changed(state: GameState, presence: Presence, connections: Connection[], serverNow: number): Map<ConnectionId, string> {
    const p = prepare(state, presence);
    const byKey = new Map<string, Sections | null>();
    const built = new Map<string, string>();
    const out = new Map<ConnectionId, string>();

    for (const { id, recipient } of connections) {
      const key = recipientKey(recipient);
      if (!byKey.has(key)) byKey.set(key, this.intern(key, sectionsFor(p, recipient)));
      const sections = byKey.get(key);
      if (!sections) continue;
      const before = this.sent.get(id);
      const names = Object.keys(sections).filter((name) => before?.[name] !== sections[name]);
      this.sent.set(id, sections);
      if (!names.length) continue;
      const cacheKey = `${key}\u0000${names.join(",")}`;
      let message = built.get(cacheKey);
      if (!message) {
        message = encode("patch", kindOf(recipient), sections, names, serverNow);
        built.set(cacheKey, message);
      }
      out.set(id, message);
    }
    // Forget screens nobody is using any more (e.g. a removed crew), so memory stays flat all day.
    for (const key of this.latest.keys()) if (!byKey.has(key)) this.latest.delete(key);
    return out;
  }

  /** A complete view for a connection that just signed in. */
  snapshot(state: GameState, presence: Presence, connection: Connection, serverNow: number): string | null {
    const key = recipientKey(connection.recipient);
    const sections = this.intern(key, sectionsFor(prepare(state, presence), connection.recipient));
    if (!sections) return null;
    this.sent.set(connection.id, sections);
    return encode("state", kindOf(connection.recipient), sections, Object.keys(sections), serverNow);
  }

  private intern(key: string, sections: Sections | null): Sections | null {
    if (!sections) return null;
    const previous = this.latest.get(key);
    if (previous) {
      for (const name of Object.keys(sections)) {
        if (previous[name] === sections[name]) sections[name] = previous[name]!;
      }
    }
    this.latest.set(key, sections);
    return sections;
  }
}

function prepare(state: GameState, presence: Presence): Prepared {
  const ctx = buildContext(state, presence);
  const shared = publicView(state, ctx);
  const { kind: _kind, ...rest } = shared;
  return { state, ctx, shared, sharedSections: toSections(rest) };
}

function toSections(value: object, prefix = ""): Sections {
  const out: Sections = {};
  for (const [name, part] of Object.entries(value)) out[prefix + name] = JSON.stringify(part ?? null);
  return out;
}

function kindOf(recipient: Recipient): "public" | "team" | "staff" {
  return recipient.role === "screen" ? "public" : recipient.role === "team" ? "team" : "staff";
}

function sectionsFor(p: Prepared, recipient: Recipient): Sections | null {
  if (recipient.role === "screen") return { ...p.sharedSections };
  if (recipient.role === "team") {
    const me = recipient.teamId ? teamMe(p.state, p.ctx, recipient.teamId) : null;
    return me ? { ...p.sharedSections, me: JSON.stringify(me) } : null;
  }
  const { staff, full, role, standings } = staffView(p.state, p.ctx, recipient.role, p.shared);
  const { audit, ...common } = staff;
  p.staffCommon ??= { ...p.sharedSections, standings: JSON.stringify(standings), ...toSections(common, STAFF_PREFIX) };
  return {
    ...p.staffCommon,
    role: JSON.stringify(role),
    full: JSON.stringify(full),
    [`${STAFF_PREFIX}audit`]: JSON.stringify(audit),
  };
}

function encode(t: "state" | "patch", kind: string, sections: Sections, names: string[], serverNow: number): string {
  const top = names.filter((n) => !n.startsWith(STAFF_PREFIX)).map((n) => `${JSON.stringify(n)}:${sections[n]}`);
  const staff = names.filter((n) => n.startsWith(STAFF_PREFIX)).map((n) => `${JSON.stringify(n.slice(STAFF_PREFIX.length))}:${sections[n]}`);
  if (staff.length) top.push(`"staff":{${staff.join(",")}}`);
  return `{"t":"${t}","serverNow":${serverNow},"view":{"kind":"${kind}"${top.length ? "," : ""}${top.join(",")}}}`;
}
