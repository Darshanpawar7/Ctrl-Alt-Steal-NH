// Turns the game state into messages for every connected screen, sending
// only the sections of each view that changed since that screen last heard
// from us. A crew auto-saving sends a 2–3 KB update to its own phones instead
// of a full copy of the game to everyone, which keeps CPU per update and
// data per phone small enough for the free plan and the venue Wi-Fi.
//
// Screens get a full `state` message when they connect, then `patch`
// messages holding just the changed top-level sections (and, for staff,
// the changed parts of `staff`). The client merges patches in.

import type { Presence } from "../../shared/protocol";
import type { GameState, Role } from "../../shared/types";
import { buildContext, publicView, staffView, teamMe, type ViewContext } from "./views";

export interface Recipient {
  role: Role;
  teamId: string | null;
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
}

const STAFF_PREFIX = "staff.";

export class Broadcaster {
  /** What each kind of screen was last sent, section by section. */
  private readonly last = new Map<string, Sections>();

  /** A patch for every recipient whose view changed, keyed by recipientKey. */
  changed(state: GameState, presence: Presence, recipients: Recipient[], serverNow: number): Map<string, string> {
    const p = prepare(state, presence);
    const out = new Map<string, string>();
    const seen = new Set<string>();
    for (const recipient of recipients) {
      const key = recipientKey(recipient);
      if (seen.has(key)) continue;
      seen.add(key);
      const sections = sectionsFor(p, recipient);
      if (!sections) continue;
      const before = this.last.get(key);
      const changedNames = Object.keys(sections).filter((name) => before?.[name] !== sections[name]);
      this.last.set(key, sections);
      if (changedNames.length) out.set(key, message("patch", kindOf(recipient), sections, changedNames, serverNow));
    }
    return out;
  }

  /** A complete view for a newly connected screen. */
  snapshot(state: GameState, presence: Presence, recipient: Recipient, serverNow: number): string | null {
    const sections = sectionsFor(prepare(state, presence), recipient);
    if (!sections) return null;
    // The new screen may hold a newer version than the rest of its group, so
    // the next broadcast resends every section to the whole group.
    this.last.delete(recipientKey(recipient));
    return message("state", kindOf(recipient), sections, Object.keys(sections), serverNow);
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
  if (recipient.role === "screen") return p.sharedSections;
  if (recipient.role === "team") {
    const me = recipient.teamId ? teamMe(p.state, p.ctx, recipient.teamId) : null;
    return me ? { ...p.sharedSections, me: JSON.stringify(me) } : null;
  }
  const { staff, full, role, standings } = staffView(p.state, p.ctx, recipient.role, p.shared);
  return {
    ...p.sharedSections,
    standings: JSON.stringify(standings),
    role: JSON.stringify(role),
    full: JSON.stringify(full),
    ...toSections(staff, STAFF_PREFIX),
  };
}

function message(t: "state" | "patch", kind: string, sections: Sections, names: string[], serverNow: number): string {
  const top = names.filter((n) => !n.startsWith(STAFF_PREFIX)).map((n) => `${JSON.stringify(n)}:${sections[n]}`);
  const staff = names.filter((n) => n.startsWith(STAFF_PREFIX)).map((n) => `${JSON.stringify(n.slice(STAFF_PREFIX.length))}:${sections[n]}`);
  if (staff.length) top.push(`"staff":{${staff.join(",")}}`);
  return `{"t":"${t}","serverNow":${serverNow},"view":{"kind":"${kind}"${top.length ? "," : ""}${top.join(",")}}}`;
}
