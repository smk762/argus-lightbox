// Open/closed state of the sidebar's facet groups: sensible defaults, remembered per group.

/** Groups most searches start from; open unless they are very long. */
const PRIMARY_GROUPS = new Set(["setting", "lighting", "identity", "people"]);

/**
 * A group with more terms than this starts collapsed, even a primary one. Only the first few terms
 * render until "Show all" anyway, so this guards against a runaway vocabulary, not a busy setting list.
 */
export const LONG_GROUP = 200;

export const FACET_OPEN_KEY = "lightbox:facet-groups-open";

/** Whether *group* starts open when the viewer has not toggled it. */
export function defaultOpen(group: string, termCount: number): boolean {
  return PRIMARY_GROUPS.has(group) && termCount <= LONG_GROUP;
}

/** Remembered open/closed state per group. Storage can be missing or throw (private mode, previews). */
export function readOpenState(storage: Pick<Storage, "getItem"> | undefined): Record<string, boolean> {
  try {
    return parseOpenState(storage?.getItem(FACET_OPEN_KEY) ?? null);
  } catch {
    return {};
  }
}

/** The stored JSON (or null) as a per-group map; anything malformed reads as nothing remembered. */
export function parseOpenState(raw: string | null): Record<string, boolean> {
  try {
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, boolean] =>
        typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

/** Store *open* for *group*, keeping the other groups' state. Failure is silent: it is only a convenience. */
export function writeOpenState(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  group: string,
  open: boolean,
): void {
  try {
    storage?.setItem(FACET_OPEN_KEY, JSON.stringify({ ...readOpenState(storage), [group]: open }));
  } catch {
    // quota, blocked site data: the default applies next time
  }
  for (const listener of listeners) listener();
}

// A tiny external store over the stored JSON string, for useSyncExternalStore: the server snapshot is
// null, so prerendered groups use their defaults and hydration matches.
const listeners = new Set<() => void>();

export function subscribeOpenState(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function rawOpenState(): string | null {
  try {
    return browserStorage()?.getItem(FACET_OPEN_KEY) ?? null;
  } catch {
    return null;
  }
}

/** `window.localStorage`, or undefined where touching it throws. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
