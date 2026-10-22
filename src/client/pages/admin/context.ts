import { createContext, useContext } from "react";
import type { Action, StaffView } from "../../../shared/protocol";

export interface StaffSession {
  view: StaffView;
  /** Sends an action. Failures are shown as a toast; resolves to whether it worked. */
  act: (action: Action) => Promise<boolean>;
  password: string;
  offset: number;
  isAdmin: boolean;
}

export const StaffContext = createContext<StaffSession | null>(null);

export function useStaff(): StaffSession {
  const session = useContext(StaffContext);
  if (!session) throw new Error("useStaff must be used inside the admin shell");
  return session;
}

/** Authenticated fetch for the admin HTTP endpoints (backup, restore, uploads). */
export async function adminFetch(password: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${password}` } });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${response.status}).`);
  }
  return response;
}
