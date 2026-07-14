/**
 * Bidirectional conversion helpers for Zotero annotation comments.
 *
 * Annotation comments use a restricted HTML subset: `<b>`, `<i>`, `<sub>`, `<sup>`.
 * In Obsidian markdown the first two map to native syntax (`**` / `*`), while
 * `<sub>` and `<sup>` map to Extended Markdown Syntax (`~` / `^`) when the
 * "Extended Markdown Syntax" plugin is active.
 *
 * These converters are intentionally simple — no AST parsing is needed for
 * four tags. They live separately from the full unified pipeline used by notes.
 */

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
