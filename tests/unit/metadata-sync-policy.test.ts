import { describe, it, expect, beforeEach } from "vitest";
import {
    normalizeTagsForCompare,
    parseTimestamp,
    isMetadataOnlyLocalChange,
    resolveMetadataByTimestamp,
    keepLocalMetadataEdit,
} from "worker/services/metadata-sync-policy";
import { db } from "db/db";
import type { AnyIDBZoteroItem } from "types/db-schema";
import type { AnyZoteroItem } from "types/zotero";

describe("metadata-sync-policy", () => {
    describe("normalizeTagsForCompare", () => {
        it("returns empty json array for empty or non-array inputs", () => {
            expect(normalizeTagsForCompare(null)).toBe("[]");
            expect(normalizeTagsForCompare(undefined)).toBe("[]");
            expect(normalizeTagsForCompare("string")).toBe("[]");
            expect(normalizeTagsForCompare([])).toBe("[]");
        });

        it("sorts tags alphabetically and produces identical keys regardless of input order", () => {
            const tags1 = [{ tag: "zebra" }, { tag: "apple" }, { tag: "banana" }];
            const tags2 = [{ tag: "banana" }, { tag: "zebra" }, { tag: "apple" }];
            expect(normalizeTagsForCompare(tags1)).toBe(normalizeTagsForCompare(tags2));
            expect(normalizeTagsForCompare(tags1)).toBe(JSON.stringify(["apple", "banana", "zebra"]));
        });

        it("handles raw string tag elements", () => {
            const tags = ["zebra", "apple"];
            expect(normalizeTagsForCompare(tags)).toBe(JSON.stringify(["apple", "zebra"]));
        });
    });

    describe("parseTimestamp", () => {
        it("parses valid ISO timestamps to milliseconds", () => {
            const iso = "2026-09-29T12:00:00.000Z";
            expect(parseTimestamp(iso)).toBe(Date.parse(iso));
        });

        it("returns null for non-string, empty, or invalid timestamp strings", () => {
            expect(parseTimestamp("")).toBeNull();
            expect(parseTimestamp("not-a-date")).toBeNull();
            expect(parseTimestamp(null)).toBeNull();
            expect(parseTimestamp(123456789)).toBeNull();
        });
    });

    describe("isMetadataOnlyLocalChange", () => {
        const createBaseItem = (): { local: AnyIDBZoteroItem; remote: AnyZoteroItem } => {
            const raw = {
                key: "ITEM1",
                version: 1,
                data: {
                    key: "ITEM1",
                    version: 1,
                    itemType: "journalArticle",
                    title: "Quantum Entanglement",
                    creators: [{ firstName: "Albert", lastName: "Einstein" }],
                    abstractNote: "Original abstract.",
                    tags: [{ tag: "physics" }],
                    dateModified: "2026-09-01T10:00:00Z",
                },
            };
            const local = {
                libraryID: 1,
                key: "ITEM1",
                version: 1,
                syncedVersion: 1,
                itemType: "journalArticle",
                title: "Quantum Entanglement",
                trashed: 0,
                dateModified: "2026-09-01T10:00:00Z",
                syncStatus: "updated",
                raw: structuredClone(raw),
            } as unknown as AnyIDBZoteroItem;
            const remote = structuredClone(raw) as unknown as AnyZoteroItem;
            return { local, remote };
        };

        it("returns false when both abstract and tags are identical", () => {
            const { local, remote } = createBaseItem();
            expect(isMetadataOnlyLocalChange(local, remote)).toBe(false);
        });

        it("returns true when only abstractNote differs", () => {
            const { local, remote } = createBaseItem();
            (local.raw.data as unknown as Record<string, unknown>).abstractNote = "Updated local abstract.";
            expect(isMetadataOnlyLocalChange(local, remote)).toBe(true);
        });

        it("returns true when only tags differ", () => {
            const { local, remote } = createBaseItem();
            (local.raw.data as unknown as Record<string, unknown>).tags = [
                { tag: "physics" },
                { tag: "quantum" },
            ];
            expect(isMetadataOnlyLocalChange(local, remote)).toBe(true);
        });

        it("returns true when both abstractNote and tags differ", () => {
            const { local, remote } = createBaseItem();
            (local.raw.data as unknown as Record<string, unknown>).abstractNote = "Updated abstract.";
            (local.raw.data as unknown as Record<string, unknown>).tags = [{ tag: "physics" }, { tag: "quantum" }];
            expect(isMetadataOnlyLocalChange(local, remote)).toBe(true);
        });

        it("returns false if tags only differ by ordering", () => {
            const { local, remote } = createBaseItem();
            (local.raw.data as unknown as Record<string, unknown>).tags = [{ tag: "alpha" }, { tag: "beta" }];
            (remote.data as unknown as Record<string, unknown>).tags = [{ tag: "beta" }, { tag: "alpha" }];
            expect(isMetadataOnlyLocalChange(local, remote)).toBe(false);
        });

        it("returns false when non-metadata fields differ (e.g. title)", () => {
            const { local, remote } = createBaseItem();
            (local.raw.data as unknown as Record<string, unknown>).abstractNote = "Updated abstract.";
            (local.raw.data as unknown as Record<string, unknown>).title = "Changed Title";
            expect(isMetadataOnlyLocalChange(local, remote)).toBe(false);
        });

        it("ignores version and dateModified differences on raw records", () => {
            const { local, remote } = createBaseItem();
            (local.raw.data as unknown as Record<string, unknown>).abstractNote = "Updated abstract.";
            (local.raw.data as unknown as Record<string, unknown>).version = 2;
            (remote.data as unknown as Record<string, unknown>).version = 3;
            (local.raw.data as unknown as Record<string, unknown>).dateModified = "2026-09-02T12:00:00Z";
            (remote.data as unknown as Record<string, unknown>).dateModified = "2026-09-01T15:00:00Z";
            expect(isMetadataOnlyLocalChange(local, remote)).toBe(true);
        });
    });

    describe("resolveMetadataByTimestamp", () => {
        const createItems = (localDate: string, remoteDate: string) => {
            const local = {
                key: "ITEM1",
                dateModified: localDate,
            } as unknown as AnyIDBZoteroItem;
            const remote = {
                data: {
                    dateModified: remoteDate,
                },
            } as unknown as AnyZoteroItem;
            return { local, remote };
        };

        it("returns 'keep-local' when local timestamp is newer", () => {
            const { local, remote } = createItems(
                "2026-09-29T12:00:00Z",
                "2026-09-29T11:00:00Z",
            );
            expect(resolveMetadataByTimestamp(local, remote)).toBe("keep-local");
        });

        it("returns 'accept-remote' when remote timestamp is newer", () => {
            const { local, remote } = createItems(
                "2026-09-29T10:00:00Z",
                "2026-09-29T11:00:00Z",
            );
            expect(resolveMetadataByTimestamp(local, remote)).toBe("accept-remote");
        });

        it("returns 'conflict' when timestamps are equal", () => {
            const { local, remote } = createItems(
                "2026-09-29T12:00:00Z",
                "2026-09-29T12:00:00Z",
            );
            expect(resolveMetadataByTimestamp(local, remote)).toBe("conflict");
        });

        it("returns 'conflict' when either timestamp is invalid", () => {
            const { local, remote } = createItems("invalid", "2026-09-29T12:00:00Z");
            expect(resolveMetadataByTimestamp(local, remote)).toBe("conflict");
        });
    });

    describe("keepLocalMetadataEdit", () => {
        beforeEach(async () => {
            await db.items.clear();
        });

        it("updates item version in IDB while retaining updated syncStatus", async () => {
            const libraryID = 1;
            const itemKey = "K1";
            const initialItem = {
                libraryID,
                key: itemKey,
                version: 5,
                syncedVersion: 5,
                itemType: "journalArticle",
                title: "Test",
                trashed: 0,
                dateModified: "2026-09-29T12:00:00Z",
                syncStatus: "updated",
                raw: {
                    key: itemKey,
                    version: 5,
                    data: {
                        key: itemKey,
                        version: 5,
                        itemType: "journalArticle",
                        abstractNote: "My local edit",
                    },
                },
            } as unknown as AnyIDBZoteroItem;
            await db.items.put(initialItem);

            const remoteRaw = {
                key: itemKey,
                version: 8,
                data: {
                    key: itemKey,
                    version: 8,
                    itemType: "journalArticle",
                },
            } as unknown as AnyZoteroItem;

            await keepLocalMetadataEdit(libraryID, initialItem, remoteRaw);

            const updated = await db.items.get([libraryID, itemKey]);
            expect(updated).toBeDefined();
            expect(updated?.version).toBe(8);
            expect(updated?.syncStatus).toBe("updated");
            expect((updated?.raw.data as unknown as Record<string, unknown>).abstractNote).toBe("My local edit");
            expect((updated?.raw.data as unknown as Record<string, unknown>).version).toBe(8);
        });
    });
});
