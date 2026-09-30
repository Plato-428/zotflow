import { db } from "db/db";
import { ZotFlowError, ZotFlowErrorCode } from "utils/error";
import {
    zotflowToZoteroLinks,
    zoteroToZotflowLinks,
} from "worker/convert/note-links";
import { createDbNoteLinkResolver } from "./note-link-resolver";

import type { AnyIDBZoteroItem, IDBZoteroItem } from "types/db-schema";
import type { NoteData } from "types/zotero-item";
import type { IParentProxy } from "bridge/types";
import type { ConvertService } from "./convert";
import type { LibraryNoteService } from "./library-note";
import type { ZotFlowSettings } from "settings/types";
import { metaMd2html } from "worker/convert/annotation-comment";
import {
    READ_STATUS_TAGS,
    isRatingTag,
    matchReadStatusEmoji,
    type TagLike,
} from "utils/special-tags";

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

        const html: string = item.raw.data.note ?? "";
        if (!html.trim()) return "";

        const vaultConfig = await this.parentHost.getVaultConfig();
        let md = await this.convertService.html2md(html, {
            annotationImageFolder:
                this.settings.annotationImageFolder.replace(/\/$/, "") ||
                undefined,
            strictLineBreaks: vaultConfig.strictLineBreaks,
            // Always on: display-only anchors, unconditionally stripped
            // on save — there is no risk for a setting to guard.
            linkCitationSpans: true,
        });

        // Display native zotero:// links as ZotFlow links. Markdown-side on
        // purpose: single-param zotero links pass the markdown serializer
        // unescaped, and the multi-param zotflow links we emit here never
        // go through a serializer again (see note-links.ts).
        if (this.settings.convertNoteLinks) {
            md = await zoteroToZotflowLinks(md, createDbNoteLinkResolver());
        }
        return md;
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

        // Zotero only allows child notes under regular items. Guarding here
        // covers every entry point (tree view, command palette, file menu).
        if (
            ["attachment", "note", "annotation"].includes(parentItem.itemType)
        ) {
            throw new ZotFlowError(
                ZotFlowErrorCode.UNKNOWN,
                "ItemNoteService",
                `Cannot create a child note under a ${parentItem.itemType} item`,
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

        let noteHtmlContent = await this.convertService.md2html(content, {
            strictLineBreaks: vaultConfig.strictLineBreaks,
        });

        // Canonical storage keeps native zotero:// links so the note
        // navigates with Zotero's reader after sync.
        if (this.settings.convertNoteLinks) {
            noteHtmlContent = await zotflowToZoteroLinks(
                noteHtmlContent,
                createDbNoteLinkResolver(),
            );
        }

        updatedRaw.data.note = noteHtmlContent;

        // Derive title from the updated HTML (same logic as normalize.ts)
        const noteHtml: string = updatedRaw.data.note ?? "";
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

    /** Generate a temporary 8-character alphanumeric key for locally-created items. */
    private generateTempKey(): string {
        let len = 8;
        let allowedKeyChars = "23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";

        let randomstring = "";
        for (let i = 0; i < len; i++) {
            let rnum = Math.floor(Math.random() * allowedKeyChars.length);
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

    /**
     * Update the abstract of a top-level bibliographic item.
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
        const currentAbstract =
            typeof rawData.abstractNote === "string"
                ? rawData.abstractNote.trim()
                : "";

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
     * Obsidian. Read-status and rating tags are preserved untouched.
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

    /**
     * Atomic helper: apply read-status, rating, and/or tags in a single pass
     * to eliminate race conditions when multiple frontmatter properties change.
     */
    async updateItemMetadata(
        libraryID: number,
        itemKey: string,
        patch: {
            readStatus?: string | null;
            rating?: string | null;
            tags?: string[];
        },
    ): Promise<void> {
        const item = await db.items.get([libraryID, itemKey]);
        if (!item) {
            this.parentHost.log(
                "warn",
                `updateItemMetadata: item ${itemKey} not found`,
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
        let currentTags = (rawData.tags as TagLike[] | undefined) ?? [];

        // 1. Process readStatus if provided
        if (patch.readStatus !== undefined) {
            const normalizedEmoji = patch.readStatus?.trim() || undefined;
            if (normalizedEmoji && !READ_STATUS_TAGS[normalizedEmoji]) {
                this.parentHost.log(
                    "warn",
                    `updateItemMetadata: unrecognized read-status "${normalizedEmoji}" for ${itemKey}`,
                    "ItemNoteService",
                );
            } else {
                currentTags = currentTags.filter(
                    (t) => matchReadStatusEmoji(t.tag) === undefined,
                );
                if (normalizedEmoji) {
                    currentTags.push({ tag: READ_STATUS_TAGS[normalizedEmoji]! });
                }
            }
        }

        // 2. Process rating if provided
        if (patch.rating !== undefined) {
            const normalizedStars = patch.rating?.trim() || undefined;
            if (normalizedStars && !isRatingTag(normalizedStars)) {
                this.parentHost.log(
                    "warn",
                    `updateItemMetadata: unrecognized rating "${normalizedStars}" for ${itemKey}`,
                    "ItemNoteService",
                );
            } else {
                currentTags = currentTags.filter((t) => !isRatingTag(t.tag));
                if (normalizedStars) {
                    currentTags.push({ tag: normalizedStars });
                }
            }
        }

        // 3. Process generic tags if provided
        if (patch.tags !== undefined) {
            const preserved = currentTags.filter(
                (t) =>
                    matchReadStatusEmoji(t.tag) !== undefined ||
                    isRatingTag(t.tag),
            );
            const normalizedNew = Array.from(
                new Set(
                    patch.tags.map((t) => t.trim()).filter((t) => t.length > 0),
                ),
            );
            currentTags = [
                ...preserved,
                ...normalizedNew.map((tag) => ({ tag })),
            ];
        }

        await this.applyTagUpdate(libraryID, itemKey, item, currentTags);

        this.parentHost.log(
            "debug",
            `Updated metadata for ${itemKey}`,
            "ItemNoteService",
        );
    }

    /**
     * Shared helper: write a new tags array back onto the item's raw data
     * and synchronize item.searchTags for autocomplete search.
     */
    private async applyTagUpdate(
        libraryID: number,
        itemKey: string,
        item: AnyIDBZoteroItem,
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
            searchTags: nextTags.map((t) => t.tag),
            syncStatus: item.syncStatus === "created" ? "created" : "updated",
            dateModified: now,
        });
    }
}
