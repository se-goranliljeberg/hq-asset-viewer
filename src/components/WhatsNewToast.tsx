import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { APP_VERSION, isOlder, markVersionSeen } from "@/lib/version-state";

const STORAGE_KEY = "hq_last_seen_version";

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

    if (!isOlder(seen, APP_VERSION)) return;
    fired.current = true;

    const isFirstVisit = !seen;
    const title = isFirstVisit
      ? `Welcome — version ${APP_VERSION}`
      : `What's new in v${APP_VERSION}`;
    const description = isFirstVisit
      ? "See the full changelog for everything this app can do."
      : `You were last on v${seen}. Tap to see what changed.`;

    toast(title, {
      description,
      duration: 12000,
      action: {
        label: "View changelog",
        onClick: () => {
          markVersionSeen();
          window.location.assign("/documentation/changelog");
        },
      },
      onDismiss: markVersionSeen,
      onAutoClose: markVersionSeen,
    });
  }, []);

  return null;
}
