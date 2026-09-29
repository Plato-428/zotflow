/**
 * Bidirectional conversion helpers for Zotero annotation comments and
 * plain-text metadata fields (title, abstract).
 *
 * Annotation comments use a restricted HTML subset: `<b>`, `<i>`, `<sub>`, `<sup>`.
 * In Obsidian markdown the first two map to native syntax (`**` / `*`), while
 * `<sub>` and `<sup>` pass through as raw inline HTML (Obsidian renders them).
 *
 * Metadata fields (title, abstractNote) are plain strings in Zotero's API but
 * may contain `<i>` / `<b>` tags added by the user for formatting. The
 * `metaHtml2md` / `metaMd2html` pair handles that lighter case without the
 * `<` / `>` escaping needed for the blockquote-embedded annotation comments.
 *
 * These converters are intentionally simple — no AST parsing is needed for
 * four tags. They live separately from the full unified pipeline used by notes.
 */

/**
 * Convert HTML inline marks in a plain metadata string to Markdown.
 *
 * Used for `title` and `abstractNote` fields which are stored as plain text
 * in Zotero but may contain `<i>` / `<b>` / `<em>` / `<strong>` tags.
 *
 * - `<b>text</b>` / `<strong>text</strong>` → `**text**`
 * - `<i>text</i>` / `<em>text</em>`         → `*text*`
 *
 * All other HTML tags are stripped.
 */
export function metaHtml2md(text: string): string {
    if (!text) return "";
    let md = text;
    md = md.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**");
    md = md.replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, "*$1*");
    md = md.replace(/<[^>]*>/g, "");
    return md;
}

/**
 * Convert Markdown inline marks back to the HTML subset that Zotero accepts
 * in plain metadata fields (`abstractNote` etc.).
 *
 * - `**text**` → `<b>text</b>`
 * - `*text*`   → `<i>text</i>`
 *
 * Bold is processed before italic to avoid treating `**` as two italic
 * markers.
 */
export function metaMd2html(text: string): string {
    if (!text) return "";
    let html = text;
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");
    html = html.replace(/(?<!\*)\*(?!\*)([\s\S]*?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");
    return html;
}


// Placeholders for <sub>/<sup> tags during escaping
const PH_SUB_OPEN = "\x00SUB_O\x00";
const PH_SUB_CLOSE = "\x00SUB_C\x00";
const PH_SUP_OPEN = "\x00SUP_O\x00";
const PH_SUP_CLOSE = "\x00SUP_C\x00";

/**
 * Convert annotation comment HTML → markdown for display in source notes.
 *
 * - `<b>text</b>` → `**text**`
 * - `<i>text</i>` → `*text*`
 * - `<sub>`, `<sup>` → kept as-is (Obsidian renders inline HTML)
 * - `>` and `<` outside of preserved tags are escaped to prevent
 *   accidental blockquote / HTML injection in markdown
 * - Newlines preserved
 */
export function annoHtml2md(html: string): string {
    if (!html) return "";

    let md = html;

    // Bold: <b>...</b> → **...**
    md = md.replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**");

    // Italic: <i>...</i> → *...*
    md = md.replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*");

    // Protect <sub>/<sup> tags with placeholders before escaping < >
    md = md.replace(/<sub>/gi, PH_SUB_OPEN);
    md = md.replace(/<\/sub>/gi, PH_SUB_CLOSE);
    md = md.replace(/<sup>/gi, PH_SUP_OPEN);
    md = md.replace(/<\/sup>/gi, PH_SUP_CLOSE);

    // Escape stray < and > so they don't produce markdown syntax
    md = md.replace(/</g, "\\<");
    md = md.replace(/>/g, "\\>");

    // Restore <sub>/<sup> tags
    md = md.replace(new RegExp(PH_SUB_OPEN, "g"), "<sub>");
    md = md.replace(new RegExp(PH_SUB_CLOSE, "g"), "</sub>");
    md = md.replace(new RegExp(PH_SUP_OPEN, "g"), "<sup>");
    md = md.replace(new RegExp(PH_SUP_CLOSE, "g"), "</sup>");

    return md;
}

/**
 * Convert annotation comment markdown → HTML for storage in IDB / Zotero sync.
 *
 * - `**text**` → `<b>text</b>`
 * - `*text*`   → `<i>text</i>`
 * - `<sub>`, `<sup>` → kept as-is
 * - Strips any other HTML tags (safety)
 */
export function annoMd2html(md: string): string {
    if (!md) return "";

    let html = md;

    // Unescape \> and \< (produced by annoHtml2md)
    html = html.replace(/\\>/g, ">");
    html = html.replace(/\\</g, "<");

    // Bold: **...** → <b>...</b>  (non-greedy, no nesting)
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");

    // Italic: *...* → <i>...</i>  (single *, not preceded/followed by *)
    html = html.replace(
        /(?<!\*)\*(?!\*)([\s\S]*?)(?<!\*)\*(?!\*)/g,
        "<i>$1</i>",
    );

    // Strip any HTML tags except the allowed subset
    html = html.replace(
        /<\/?(?!b>|i>|sub>|sup>|\/b>|\/i>|\/sub>|\/sup>)[^>]*>/gi,
        "",
    );

    return html;
}
