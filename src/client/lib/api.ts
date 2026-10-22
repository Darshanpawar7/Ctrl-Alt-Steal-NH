import { useEffect, useState } from "react";
import type { PublicInfo } from "../../shared/protocol";

export function usePublicInfo(): { info: PublicInfo | null; failed: boolean } {
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public", { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PublicInfo>) : Promise.reject(new Error(String(r.status)))))
      .then(setInfo)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return { info, failed };
}

export async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data as T;
}

/** Only allow http(s) links from editable settings into an href. */
export function safeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
