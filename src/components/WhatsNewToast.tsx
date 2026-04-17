import { useEffect, useRef } from "react";
import { toast } from "sonner";
import pkg from "../../package.json";

const STORAGE_KEY = "hq_last_seen_version";
const CURRENT_VERSION: string = pkg.version;

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isOlder(seen: string | null, current: string): boolean {
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

/**
 * Shows a "What's new" toast once per browser when the stored last-seen
 * version is older than the current package.json version. Clicking the
 * toast action opens the changelog. Marking dismissal stores the current
 * version so it won't reappear until the next bump.
 */
export function WhatsNewToast() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (typeof window === "undefined") return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(STORAGE_KEY); } catch { /* noop */ }

    if (!isOlder(seen, CURRENT_VERSION)) return;
    fired.current = true;

    const markSeen = () => {
      try { localStorage.setItem(STORAGE_KEY, CURRENT_VERSION); } catch { /* noop */ }
    };

    const isFirstVisit = !seen;
    const title = isFirstVisit
      ? `Welcome — version ${CURRENT_VERSION}`
      : `What's new in v${CURRENT_VERSION}`;
    const description = isFirstVisit
      ? "See the full changelog for everything this app can do."
      : `You were last on v${seen}. Tap to see what changed.`;

    toast(title, {
      description,
      duration: 12000,
      action: {
        label: "View changelog",
        onClick: () => {
          markSeen();
          window.location.assign("/documentation/changelog");
        },
      },
      onDismiss: markSeen,
      onAutoClose: markSeen,
    });
  }, []);

  return null;
}
