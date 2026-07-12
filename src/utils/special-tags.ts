/**
 * Shared logic for splitting "special" Zotero tags (injected by third-party
 * Zotero plugins like Zotero Reading List and Ethereal Style) out of the
 * generic tag list so they can be rendered as their own YAML frontmatter
 * fields instead of cluttering Obsidian's tag list.
 *
 * Read status tags (Zotero Reading List): full tag text is "<emoji> <label>",
 * e.g. "\ud83d\udcd9 To Read". We key off the emoji prefix only — the label
 * itself is never shown in Obsidian (kept identical to the emoji so a
 * narrow Bases column can be used).
 *
 * Rating tags (Ethereal Style): tag text is 1-5 repetitions of the star
 * character with no accompanying label, e.g. "\u2b50\u2b50\u2b50".
 */

export interface TagLike {
    tag: string;
    type?: number;
}

/** Emoji -> full Zotero tag text (Zotero Reading List plugin). */
export const READ_STATUS_TAGS: Record<string, string> = {
    "\ud83d\udcd9": "\ud83d\udcd9 To Read", // 📙 To Read
    "\ud83d\udcd7": "\ud83d\udcd7 Read", // 📗 Read
    "\ud83d\udca1": "\ud83d\udca1 New", // 💡 New
    "\ud83d\udcd6": "\ud83d\udcd6 In Progress", // 📖 In Progress
};

/** Rating tag text is 1-5 star characters and nothing else. */
export const RATING_REGEX = /^\u2b50{1,5}$/;

/**
 * Strip Unicode variation selectors (e.g. U+FE0F, the "emoji presentation"
 * selector) that some sources include after an emoji and others omit —
 * without this, a tag like "\ud83d\udcd9\ufe0f To Read" (variation selector
 * present) would fail to match against the plain "\ud83d\udcd9" key below.
 * Also strips any literal `#` characters: some Zotero tags picked up a
 * stray embedded `#` from earlier round-trips through Obsidian (before the
 * tag-sync hash handling was finalized), e.g. a malformed "#\u2b50\u2b50\u2b50"
 * tag sitting alongside the real "\u2b50\u2b50\u2b50" one. Matching should
 * be tolerant of that so both get excluded from the generic tag list.
 */
function normalizeForMatch(s: string): string {
    return s.replace(/[\ufe00-\ufe0f]/g, "").replace(/#/g, "");
}

/** Return the registered read-status emoji this tag represents, if any. */
export function matchReadStatusEmoji(tag: string): string | undefined {
    const normalized = normalizeForMatch(tag.trim());
    for (const emoji of Object.keys(READ_STATUS_TAGS)) {
        if (normalized.startsWith(normalizeForMatch(emoji))) return emoji;
    }
    return undefined;
}

/** True when the tag is a bare 1-5 character star-rating tag. */
export function isRatingTag(tag: string): boolean {
    return RATING_REGEX.test(normalizeForMatch(tag.trim()));
}

/**
 * Convert a rendered Obsidian tag string back to raw Zotero tag text.
 * Preserves any `#` characters the user typed literally — many users (e.g.
 * via Ethereal Style/Reading List conventions) deliberately keep a leading
 * `#` in their Zotero tag text to distinguish user-created tags from
 * automatic ones, and want that hash to round-trip back to Zotero as-is.
 * Only normalizes the space<->underscore convention used for rendering
 * (Obsidian tags can't contain literal spaces). Note this is lossy if a tag
 * legitimately contains an underscore.
 */
export function obsidianTagToZoteroTag(tag: string): string {
    return tag.trim().replace(/_/g, " ");
}

/**
 * Convert a raw Zotero tag string into the single-hash Obsidian tag form
 * used for display (frontmatter `tags:` array and the body "Tags:" line).
 * Strips ANY existing `#` characters first (mirrors the template's
 * `remove: "#"` Liquid filter) then adds exactly one `#` prefix — this
 * guarantees a single leading hash regardless of whether the raw Zotero tag
 * text already contains one, avoiding a doubled `##` artifact.
 */
export function zoteroTagToObsidianTag(tag: string): string {
    return `#${tag.replace(/#/g, "").replace(/ /g, "_")}`;
}

/**
 * Parse a rendered "Tags:" body line (e.g. `**Tags:** #Foo, #Bar_Baz`) back
 * into raw Zotero tag names. Any label text before the first `#` is
 * ignored — this works regardless of the exact label wording, as long as
 * the label itself contains no literal `#` character.
 */
export function parseTagsLine(line: string): string[] {
    const firstHash = line.indexOf("#");
    const tagsPortion = firstHash >= 0 ? line.slice(firstHash) : "";
    return tagsPortion
        .split(",")
        .map((t) => obsidianTagToZoteroTag(t))
        .filter((t) => t.length > 0);
}

/**
 * Split a Zotero tag list into { readStatus, rating, remaining }.
 * `remaining` excludes ALL matched read-status/rating tags (not just the
 * first) so they don't pollute Obsidian's generic `tags:` frontmatter
 * field — Zotero items can end up with more than one such tag (e.g. a
 * stale "New" tag left behind alongside a newer "To Read" tag, or
 * duplicate rating tags), and every one of them must be excluded even
 * though only the last-seen value is kept as the representative
 * readStatus/rating for the note.
 */
export function splitSpecialTags<T extends TagLike>(
    tags: T[] | undefined | null,
): { readStatus?: string; rating?: string; remaining: T[] } {
    let readStatus: string | undefined;
    let rating: string | undefined;
    const remaining: T[] = [];

    for (const t of tags ?? []) {
        const emoji = matchReadStatusEmoji(t.tag);
        if (emoji) {
            readStatus = emoji;
            continue;
        }
        if (isRatingTag(t.tag)) {
            rating = t.tag;
            continue;
        }
        remaining.push(t);
    }

    return { readStatus, rating, remaining };
}
