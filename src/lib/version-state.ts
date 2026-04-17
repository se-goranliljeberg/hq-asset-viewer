import { useEffect, useState } from "react";
import pkg from "../../package.json";

const STORAGE_KEY = "hq_last_seen_version";
const SESSION_DISMISS_KEY = "hq_changelog_dismissed_session";

export const APP_VERSION: string = (pkg as { version?: string }).version ?? "0.0.0";

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isOlder(seen: string | null, current: string): boolean {
  if (!seen) return true;
  const a = parseSemver(seen);
  const b = parseSemver(current);
  if (!a || !b) return seen !== current;
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

function readUnseen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === APP_VERSION) return false;
    const seen = localStorage.getItem(STORAGE_KEY);
    return isOlder(seen, APP_VERSION);
  } catch { return false; }
}

/**
 * Marks the current version as "seen" both permanently (localStorage) and
 * for this browser session (sessionStorage), then notifies all subscribers
 * so any NEW badges across the UI hide immediately.
 */
export function markVersionSeen() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
    sessionStorage.setItem(SESSION_DISMISS_KEY, APP_VERSION);
  } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent("hq:version-seen"));
}

/**
 * Returns true while the current app version is newer than what this browser
 * has acknowledged AND the user hasn't dismissed it in this session yet.
 * Used by the NEW badge in the header.
 */
export function useHasUnseenVersion(): boolean {
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    setUnseen(readUnseen());
    const onSeen = () => setUnseen(false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setUnseen(readUnseen());
    };
    window.addEventListener("hq:version-seen", onSeen);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("hq:version-seen", onSeen);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return unseen;
}
