import { db } from "db/db";
import type { AnyIDBZoteroItem } from "types/db-schema";
import type { AnyZoteroItem } from "types/zotero";

/** Order-independent comparison key for a Zotero tags array. */
export function normalizeTagsForCompare(tags: unknown): string {
    if (!Array.isArray(tags)) return "[]";
    return JSON.stringify(
        tags
            .map((t: unknown) => {
                if (typeof t === "string") return t;
                if (typeof t === "object" && t !== null && "tag" in t) {
                    return String((t as { tag: unknown }).tag ?? "");
                }
                return "";
            })
            .sort((a, b) => a.localeCompare(b)),
    );
}

/** Parse an ISO 8601 or Zotero timestamp string into milliseconds since epoch, or null if invalid. */
export function parseTimestamp(value: unknown): number | null {
    if (typeof value !== "string" || value.trim() === "") return null;
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? null : millis;
}

/**
 * True when the only local/remote divergence is in tracked metadata fields
 * (abstractNote, tags) — i.e. fields with timestamp-based last-write-wins
 * resolution. Any other field difference (e.g. title, creators) is treated as a real conflict.
 */
export function isMetadataOnlyLocalChange(
    localItem: AnyIDBZoteroItem,
    remoteRaw: AnyZoteroItem,
): boolean {
    const localData = (localItem?.raw?.data ?? {}) as unknown as Record<string, unknown>;
    const remoteData = (remoteRaw?.data ?? {}) as unknown as Record<string, unknown>;

    const localAbstract = String(localData.abstractNote ?? "");
    const remoteAbstract = String(remoteData.abstractNote ?? "");
    const localTags = normalizeTagsForCompare(localData.tags);
    const remoteTags = normalizeTagsForCompare(remoteData.tags);

    // If neither abstract nor tags changed, it's not a metadata change.
    if (localAbstract === remoteAbstract && localTags === remoteTags) {
        return false;
    }

    const ignoredKeys = new Set([
        "key",
        "version",
        "dateModified",
        "abstractNote",
        "tags",
    ]);
    const keys = new Set([
        ...Object.keys(localData),
        ...Object.keys(remoteData),
    ]);

    for (const key of keys) {
        if (ignoredKeys.has(key)) continue;
        const left = localData[key];
        const right = remoteData[key];
        if (JSON.stringify(left) !== JSON.stringify(right)) return false;
    }
    return true;
}

/**
 * Compare timestamps between local item and remote item.
 * - If local is strictly newer: returns "keep-local"
 * - If remote is strictly newer: returns "accept-remote"
 * - If equal or invalid timestamp: returns "conflict"
 */
export function resolveMetadataByTimestamp(
    localItem: AnyIDBZoteroItem,
    remoteRaw: AnyZoteroItem,
): "keep-local" | "accept-remote" | "conflict" {
    const localTs = parseTimestamp(localItem?.dateModified);
    const remoteTs = parseTimestamp(
        (remoteRaw?.data as unknown as Record<string, unknown> | undefined)?.dateModified,
    );
    if (localTs === null || remoteTs === null) return "conflict";
    if (localTs > remoteTs) return "keep-local";
    if (remoteTs > localTs) return "accept-remote";
    return "conflict";
}

/**
 * Safely updates localItem's version to match remoteRaw so the local metadata
 * edit can be pushed to Zotero on the next sync push phase.
 */
export async function keepLocalMetadataEdit(
    libraryID: number,
    localItem: AnyIDBZoteroItem,
    remoteRaw: AnyZoteroItem,
): Promise<void> {
    const updatedRaw = structuredClone(localItem.raw);
    const version =
        typeof remoteRaw.version === "number"
            ? remoteRaw.version
            : localItem.version;
    updatedRaw.version = version;
    if (updatedRaw.data) {
        updatedRaw.data.version = version;
    }

    await db.items.update([libraryID, localItem.key], {
        raw: updatedRaw,
        version: version,
        syncStatus: "updated",
    });
}
