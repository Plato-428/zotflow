import { db } from "db/db";
import { ZotFlowError, ZotFlowErrorCode } from "utils/error";

import type { IDBZoteroItem } from "types/db-schema";
import type { NoteData } from "types/zotero-item";
import type { IParentProxy } from "bridge/types";
import type { ConvertService } from "./convert";
import type { LibraryNoteService, UpdateOptions } from "./library-note";
import type { ZotFlowSettings } from "settings/types";
import {
    READ_STATUS_TAGS,
    matchReadStatusEmoji,
    isRatingTag,
    type TagLike,
} from "utils/special-tags";
import { metaMd2html } from "worker/convert/annotation-comment";

/**
 * CRUD service for Zotero **child note items** (the note items attached to
 * parent items inside a Zotero library).
 *
 * Separated from `LibraryNoteService` (which manages Obsidian source notes
 * rendered from templates) because the two operate on different data:
 *   - ItemNoteService  → IDB `items` table (itemType "note")
 *   - LibraryNoteService → Obsidian vault files
 */
export class ItemNoteService {
    constructor(
        private settings: ZotFlowSettings,
        private parentHost: IParentProxy,
        private convertService: ConvertService,
        private sourceNoteService: LibraryNoteService,
    ) {}

    updateSettings(newSettings: ZotFlowSettings) {
        this.settings = newSettings;
    }

    /**
     * Return the content of a Zotero child note as Markdown.
     */
    async getNoteAsMarkdown(
        libraryID: number,
        noteKey: string,
    ): Promise<string> {
        const item = await db.items.get([libraryID, noteKey]);

        if (!item || item.itemType !== "note") {
            this.parentHost.log(
                "warn",
                `getNoteAsMarkdown: item ${noteKey} not found or not a note`,
                "ItemNoteService",
            );
            return "";
        }

        const html: string = (item.raw.data as any).note ?? "";
        if (!html.trim()) return "";

        const vaultConfig = await this.parentHost.getVaultConfig();
        return this.convertService.html2md(html, {
            annotationImageFolder:
                this.settings.annotationImageFolder.replace(/\/$/, "") ||
                undefined,
            strictLineBreaks: vaultConfig.strictLineBreaks,
        });
    }

    /**
     * Create a new empty child note under a parent item and persist it to IDB
     * with `syncStatus: "created"` so the next sync pushes it to Zotero.
     *
     * Returns the generated key for opening the note in the preview view.
     */
    async createChildNote(
        libraryID: number,
        parentKey: string,
    ): Promise<string> {
        const parentItem = await db.items.get([libraryID, parentKey]);
        if (!parentItem) {
            throw new ZotFlowError(
                ZotFlowErrorCode.RESOURCE_MISSING,
                "ItemNoteService",
                `Parent item ${parentKey} not found in library ${libraryID}`,
            );
        }

        const key = this.generateTempKey();
        const now = new Date().toISOString().split(".")[0] + "Z";
        const library = parentItem.raw.library;

        const newItem: IDBZoteroItem<NoteData> = {
            libraryID,
            key,
            itemType: "note",
            parentItem: parentKey,
            title: "",
            collections: [],
            dateAdded: now,
            dateModified: now,
            version: 0,
            trashed: 0,
            searchCreators: [],
            searchTags: [],
            syncStatus: "created",
            syncedAt: now,
            syncError: "",
            raw: {
                key,
                version: 0,
                library,
                links: {},
                meta: { numChildren: 0 },
                data: {
                    key,
                    itemType: "note",
                    parentItem: parentKey,
                    note: "",
                    relations: {},
                    dateAdded: now,
                    dateModified: now,
                    tags: [],
                    deleted: false,
                    version: 0,
                } as unknown as NoteData,
            },
        };

        await db.transaction("rw", db.items, async () => {
            await db.items.put(newItem);
        });

        this.parentHost.log(
            "info",
            `Created child note ${key} under ${parentKey}`,
            "ItemNoteService",
        );

        // Notify main thread so the tree can refresh
        this.parentHost.onNoteChangedByNoteView(libraryID, key, parentKey);

        return key;
    }

    /**
     * Update the content of a Zotero child note item in IDB.
     * Marks the item as "updated" so the next bidirectional sync pushes it to Zotero.
     *
     * @param origin — `"editor"` when called from the source-note editable
     *   region (skips re-rendering the source note to avoid a circular
     *   overwrite); `"note-view"` when called from the standalone
     *   NotePreviewView (triggers a debounced source-note re-render).
     */
    async updateNoteContent(
        libraryID: number,
        noteKey: string,
        content: string,
        origin: "editor" | "note-view" = "note-view",
    ): Promise<void> {
        const item = await db.items.get([libraryID, noteKey]);

        if (!item || item.itemType !== "note") {
            this.parentHost.log(
                "warn",
                `updateNoteContent: item ${noteKey} not found or not a note`,
                "ItemNoteService",
            );
            return;
        }

        const updatedRaw = structuredClone(item.raw);
        const vaultConfig = await this.parentHost.getVaultConfig();

        (updatedRaw.data as any).note = await this.convertService.md2html(
            content,
            {
                strictLineBreaks: vaultConfig.strictLineBreaks,
            },
        );

        // Derive title from the updated HTML (same logic as normalize.ts)
        const noteHtml: string = (updatedRaw.data as any).note ?? "";
        const plainText = noteHtml.replace(/<[^>]+>/g, " ");
        const title =
            (plainText.split("\n")[0] ?? plainText).slice(0, 50).trim() ||
            `Note ${noteKey}`;

        await db.items.update([libraryID, noteKey], {
            raw: updatedRaw,
            title,
            syncStatus: item.syncStatus === "created" ? "created" : "updated",
            dateModified: new Date().toISOString(),
        });

        this.parentHost.log(
            "debug",
            `Updated note content for ${noteKey}`,
            "ItemNoteService",
        );

        // Notify main thread so the note-view and tree can react
        if (origin === "editor") {
            this.parentHost.onNoteChangedByEditor(
                libraryID,
                noteKey,
                item.parentItem,
            );
        } else {
            this.parentHost.onNoteChangedByNoteView(
                libraryID,
                noteKey,
                item.parentItem,
            );
        }

        // Re-render the parent source note only when the edit comes from the
        // standalone NotePreviewView.  When the edit originates from the
        // source-note editable region itself, re-rendering would overwrite
        // what the user just typed (circular).
        if (origin === "note-view" && item.parentItem) {
            this.sourceNoteService
                .triggerUpdate(
                    libraryID,
                    item.parentItem,
                    { forceUpdateContent: true, forceUpdateImages: false },
                    true,
                )
                .catch((e) =>
                    this.parentHost.log(
                        "error",
                        `Failed to trigger source note update after note edit`,
                        "ItemNoteService",
                        e,
                    ),
                );
        }
    }

    /**
     * Update the abstract field on a top-level Zotero item.
     * Called from the source-note editable ABSTRACT region.
     */
    async updateItemAbstract(
        libraryID: number,
        itemKey: string,
        abstractText: string,
    ): Promise<void> {
        const item = await db.items.get([libraryID, itemKey]);

        if (!item) {
            this.parentHost.log(
                "warn",
                `updateItemAbstract: item ${itemKey} not found`,
                "ItemNoteService",
            );
            return;
        }

        // Abstract belongs to top-level bibliographic items, not child notes/
        // annotations/attachments.
        if (
            item.itemType === "note" ||
            item.itemType === "annotation" ||
            item.itemType === "attachment"
        ) {
            this.parentHost.log(
                "warn",
                `updateItemAbstract: item ${itemKey} is not a top-level bibliographic item`,
                "ItemNoteService",
            );
            return;
        }

        const updatedRaw = structuredClone(item.raw);
        const rawData = (updatedRaw.data ?? {}) as unknown as Record<
            string,
            unknown
        >;
        const nextAbstract = metaMd2html(abstractText.trim());
        const currentAbstract = String(rawData.abstractNote ?? "").trim();

        // Avoid dirtying the record when the normalized content is unchanged.
        if (currentAbstract === nextAbstract) return;

        rawData.abstractNote = nextAbstract;
        updatedRaw.data = rawData as unknown as typeof updatedRaw.data;

        const now = new Date().toISOString();
        rawData.dateModified = now;

        await db.items.update([libraryID, itemKey], {
            raw: updatedRaw,
            syncStatus: item.syncStatus === "created" ? "created" : "updated",
            dateModified: now,
        });

        this.parentHost.log(
            "debug",
            `Updated abstract for ${itemKey}`,
            "ItemNoteService",
        );
    }

    /**
     * Update the Zotero Reading List status tag on a top-level item.
     * Called when the `read-status` frontmatter field is edited in Obsidian.
     * Pass `null`/empty string to remove the status tag entirely.
     */
    async updateItemReadStatus(
        libraryID: number,
        itemKey: string,
        newEmoji: string | null,
    ): Promise<void> {
        const item = await db.items.get([libraryID, itemKey]);
        if (!item) {
            this.parentHost.log(
                "warn",
                `updateItemReadStatus: item ${itemKey} not found`,
                "ItemNoteService",
            );
            return;
        }
        if (
            item.itemType === "note" ||
            item.itemType === "annotation" ||
            item.itemType === "attachment"
        ) {
            return;
        }

        const normalizedEmoji = newEmoji?.trim() || undefined;
        if (normalizedEmoji && !READ_STATUS_TAGS[normalizedEmoji]) {
            this.parentHost.log(
                "warn",
                `updateItemReadStatus: unrecognized read-status value "${normalizedEmoji}" for ${itemKey}`,
                "ItemNoteService",
            );
            return;
        }

        const rawData = (item.raw.data ?? {}) as unknown as Record<
            string,
            unknown
        >;
        const currentTags = (rawData.tags as TagLike[] | undefined) ?? [];
        const currentEmoji = currentTags
            .map((t) => matchReadStatusEmoji(t.tag))
            .find((e) => e !== undefined);

        // No-op if the derived status already matches (avoids marking the
        // item dirty on every startup metadata-cache scan).
        if ((currentEmoji ?? undefined) === normalizedEmoji) return;

        const nextTags = currentTags.filter(
            (t) => matchReadStatusEmoji(t.tag) === undefined,
        );
        if (normalizedEmoji) {
            nextTags.push({ tag: READ_STATUS_TAGS[normalizedEmoji]! });
        }

        await this.applyTagUpdate(libraryID, itemKey, item, nextTags);

        this.parentHost.log(
            "debug",
            `Updated read-status for ${itemKey}`,
            "ItemNoteService",
        );
    }

    /**
     * Update the Ethereal Style star-rating tag on a top-level item.
     * Called when the `rating` frontmatter field is edited in Obsidian.
     * Pass `null`/empty string to remove the rating tag entirely.
     */
    async updateItemRating(
        libraryID: number,
        itemKey: string,
        newStars: string | null,
    ): Promise<void> {
        const item = await db.items.get([libraryID, itemKey]);
        if (!item) {
            this.parentHost.log(
                "warn",
                `updateItemRating: item ${itemKey} not found`,
                "ItemNoteService",
            );
            return;
        }
        if (
            item.itemType === "note" ||
            item.itemType === "annotation" ||
            item.itemType === "attachment"
        ) {
            return;
        }

        const normalizedStars = newStars?.trim() || undefined;
        if (normalizedStars && !isRatingTag(normalizedStars)) {
            this.parentHost.log(
                "warn",
                `updateItemRating: unrecognized rating value "${normalizedStars}" for ${itemKey}`,
                "ItemNoteService",
            );
            return;
        }

        const rawData = (item.raw.data ?? {}) as unknown as Record<
            string,
            unknown
        >;
        const currentTags = (rawData.tags as TagLike[] | undefined) ?? [];
        const currentStars = currentTags
            .map((t) => t.tag)
            .find((tag) => isRatingTag(tag));

        if ((currentStars ?? undefined) === normalizedStars) return;

        const nextTags = currentTags.filter((t) => !isRatingTag(t.tag));
        if (normalizedStars) {
            nextTags.push({ tag: normalizedStars });
        }

        await this.applyTagUpdate(libraryID, itemKey, item, nextTags);

        this.parentHost.log(
            "debug",
            `Updated rating for ${itemKey}`,
            "ItemNoteService",
        );
    }

    /**
     * Replace the generic (non read-status, non-rating) tag set on a
     * top-level item. Called when the `tags` frontmatter field is edited in
     * Obsidian. Read-status and rating tags are preserved untouched — those
     * are managed separately via updateItemReadStatus/updateItemRating.
     */
    async updateItemTags(
        libraryID: number,
        itemKey: string,
        newTagNames: string[],
    ): Promise<void> {
        const item = await db.items.get([libraryID, itemKey]);
        if (!item) {
            this.parentHost.log(
                "warn",
                `updateItemTags: item ${itemKey} not found`,
                "ItemNoteService",
            );
            return;
        }
        if (
            item.itemType === "note" ||
            item.itemType === "annotation" ||
            item.itemType === "attachment"
        ) {
            return;
        }

        const rawData = (item.raw.data ?? {}) as unknown as Record<
            string,
            unknown
        >;
        const currentTags = (rawData.tags as TagLike[] | undefined) ?? [];

        // Preserve read-status/rating tags — they're managed by their own
        // dedicated update methods and rendered as separate frontmatter
        // fields, not part of the generic `tags:` list.
        const preserved = currentTags.filter(
            (t) =>
                matchReadStatusEmoji(t.tag) !== undefined ||
                isRatingTag(t.tag),
        );
        const currentRemaining = currentTags.filter(
            (t) =>
                matchReadStatusEmoji(t.tag) === undefined &&
                !isRatingTag(t.tag),
        );

        const normalizedNew = Array.from(
            new Set(
                newTagNames.map((t) => t.trim()).filter((t) => t.length > 0),
            ),
        );
        const normalizedCurrent = currentRemaining.map((t) => t.tag);

        // No-op if the (order-independent) tag set is unchanged — avoids
        // marking the item dirty on every startup metadata-cache scan.
        const sortedNew = [...normalizedNew].sort();
        const sortedCurrent = [...normalizedCurrent].sort();
        if (JSON.stringify(sortedNew) === JSON.stringify(sortedCurrent)) {
            return;
        }

        const nextTags: TagLike[] = [
            ...preserved,
            ...normalizedNew.map((tag) => ({ tag })),
        ];

        await this.applyTagUpdate(libraryID, itemKey, item, nextTags);

        this.parentHost.log(
            "debug",
            `Updated tags for ${itemKey}`,
            "ItemNoteService",
        );
    }

    /** Shared helper: write a new tags array back onto the item's raw data. */
    private async applyTagUpdate(
        libraryID: number,
        itemKey: string,
        item: IDBZoteroItem<any>,
        nextTags: TagLike[],
    ): Promise<void> {
        const updatedRaw = structuredClone(item.raw);
        const rawData = (updatedRaw.data ?? {}) as unknown as Record<
            string,
            unknown
        >;
        rawData.tags = nextTags;
        const now = new Date().toISOString();
        rawData.dateModified = now;
        updatedRaw.data = rawData as unknown as typeof updatedRaw.data;

        await db.items.update([libraryID, itemKey], {
            raw: updatedRaw,
            syncStatus: item.syncStatus === "created" ? "created" : "updated",
            dateModified: now,
        });
    }

    /** Generate a temporary 8-character alphanumeric key for locally-created items. */
    private generateTempKey(): string {
        let len = 8;
        let allowedKeyChars = "23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";

        var randomstring = "";
        for (var i = 0; i < len; i++) {
            var rnum = Math.floor(Math.random() * allowedKeyChars.length);
            randomstring += allowedKeyChars.substring(rnum, rnum + 1);
        }
        return randomstring;
    }

    /**
     * Delete or soft-trash a child note.
     */
    async deleteNote(libraryID: number, noteKey: string): Promise<void> {
        const item = await db.items.get([libraryID, noteKey]);
        if (!item || item.itemType !== "note") return;

        if (item.syncStatus === "created") {
            await db.items.delete([libraryID, noteKey]);
        } else {
            const updatedRaw = structuredClone(item.raw);
            updatedRaw.data.deleted = true;
            await db.items.update([libraryID, noteKey], {
                trashed: 1,
                raw: updatedRaw,
                syncStatus: "updated",
            });
        }

        this.parentHost.log(
            "info",
            `Deleted note ${noteKey} (${item.syncStatus === "created" ? "hard" : "soft"})`,
            "ItemNoteService",
        );
    }
}
