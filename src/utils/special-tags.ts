/**
 * Shared logic for splitting "special" Zotero tags (injected by third-party
 * Zotero plugins like Zotero Reading List and Ethereal Style) out of the
 * generic tag list so they can be rendered as their own YAML frontmatter
 * fields instead of cluttering Obsidian's tag list.
 *
 * Read status tags (Zotero Reading List): full tag text is "<emoji> <label>",
 * e.g. "📙 To Read". We key off the emoji prefix only — the label
 * itself is never shown in Obsidian (kept identical to the emoji so a
 * narrow Bases column can be used).
 *
 * Rating tags (Ethereal Style): tag text is 1-5 repetitions of the star
 * character with no accompanying label, e.g. "⭐⭐⭐".
 */

export interface TagLike {
    tag: string;
    type?: number;
}

/** Emoji -> full Zotero tag text (Zotero Reading List plugin). */
export const READ_STATUS_TAGS: Record<string, string> = {
    "📙": "📙 To Read", // 📙 To Read
    "📗": "📗 Read", // 📗 Read
    "💡": "💡 New", // 💡 New
    "📖": "📖 In Progress", // 📖 In Progress
};

/** Rating tag text is 1-5 star characters and nothing else. */
export const RATING_REGEX = /^⭐{1,5}$/;

/** Return the registered read-status emoji this tag represents, if any. */
export function matchReadStatusEmoji(tag: string): string | undefined {
    for (const emoji of Object.keys(READ_STATUS_TAGS)) {
        if (tag.startsWith(emoji)) return emoji;
    }
    return undefined;
}

/** True when the tag is a bare 1-5 character star-rating tag. */
export function isRatingTag(tag: string): boolean {
    return RATING_REGEX.test(tag);
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
 * `remaining` excludes any matched read-status/rating tags so they don't
 * pollute Obsidian's generic `tags:` frontmatter field.
 */
export function splitSpecialTags<T extends TagLike>(
    tags: T[] | undefined | null,
): { readStatus?: string; rating?: string; remaining: T[] } {
    let readStatus: string | undefined;
    let rating: string | undefined;
    const remaining: T[] = [];

    for (const t of tags ?? []) {
        if (readStatus === undefined) {
            const emoji = matchReadStatusEmoji(t.tag);
            if (emoji) {
                readStatus = emoji;
                continue;
            }
        }
        if (rating === undefined && isRatingTag(t.tag)) {
            rating = t.tag;
            continue;
        }
        remaining.push(t);
    }

    return { readStatus, rating, remaining };
}
