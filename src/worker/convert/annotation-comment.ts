/**
 * Bidirectional conversion helpers for Zotero annotation comments and
 * plain-text metadata fields (title, abstract).
 *
 * Annotation comments use a restricted HTML subset: `<b>`, `<i>`, `<sub>`, `<sup>`.
 * In Obsidian markdown the first two map to native syntax (`**` / `*`), while
 * `<sub>` and `<sup>` map to Extended Markdown Syntax (`~` / `^`) when the
 * "Extended Markdown Syntax" plugin is active.
 *
 * Metadata fields (title, abstractNote) are plain strings in Zotero's API but
 * may contain `<i>` / `<b>` tags added by the user for formatting.  The
 * `metaHtml2md` / `metaMd2html` pair handles that lighter case without the
 * `<` / `>` escaping needed for the blockquote-embedded annotation comments.
 *
 * These converters are intentionally simple — no AST parsing is needed for
 * a handful of tags. They live separately from the full unified pipeline used
 * by notes.
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
    // Trim whitespace inside the tags before wrapping, so
    // "the <i> Symposium </i> is" → "the *Symposium* is"
    md = md.replace(
        /<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi,
        (_, p1: string) => `**${p1.trim()}**`,
    );
    md = md.replace(
        /<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi,
        (_, p1: string) => `*${p1.trim()}*`,
    );
    // Strip any remaining HTML tags
    md = md.replace(/<[^>]*>/g, "");
    // Collapse double (or more) spaces that Zotero plain-text editors
    // sometimes add around inline HTML tags  ("the  *word*  is" → "the *word* is")
    md = md.replace(/ {2,}/g, " ");
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
    // Bold first (** before *)
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");
    // Italic: single *, not adjacent to another *
    html = html.replace(/(?<!\*)\*(?!\*)([\s\S]*?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");
    return html;
}

/**
 * Convert annotation comment HTML → markdown for display in source notes.
 *
 * - `<b>text</b>` → `**text**`
 * - `<i>text</i>` → `*text*`
 * - `<sub>text</sub>` → `~text~`  (Extended Markdown Syntax)
 * - `<sup>text</sup>` → `^text^`  (Extended Markdown Syntax)
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

    // Subscript: <sub>...</sub> → ~...~  (Extended Markdown Syntax)
    md = md.replace(/<sub>([\s\S]*?)<\/sub>/gi, "~$1~");

    // Superscript: <sup>...</sup> → ^...^  (Extended Markdown Syntax)
    md = md.replace(/<sup>([\s\S]*?)<\/sup>/gi, "^$1^");

    // Escape stray < and > so they don't produce markdown syntax
    md = md.replace(/</g, "\\<");
    md = md.replace(/>/g, "\\>");

    return md;
}

/**
 * Convert annotation comment markdown → HTML for storage in IDB / Zotero sync.
 *
 * - `**text**` → `<b>text</b>`
 * - `*text*`   → `<i>text</i>`
 * - `~text~`   → `<sub>text</sub>`  (Extended Markdown Syntax)
 * - `^text^`   → `<sup>text</sup>`  (Extended Markdown Syntax)
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

    // Subscript: ~...~ → <sub>...</sub>  (single tilde, not double)
    html = html.replace(/(?<!~)~([^~]+)~(?!~)/g, "<sub>$1</sub>");

    // Superscript: ^...^ → <sup>...</sup>
    html = html.replace(/\^([^^]+)\^/g, "<sup>$1</sup>");

    // Strip any HTML tags except the allowed subset
    html = html.replace(
        /<\/?(?!b>|i>|sub>|sup>|\/b>|\/i>|\/sub>|\/sup>)[^>]*>/gi,
        "",
    );

    return html;
}
