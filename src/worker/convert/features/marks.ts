/**
 * Inline marks — underline, sub/superscript, strikethrough.
 *
 * `~~strike~~` has GFM syntax; the other three do not and survive as inline
 * HTML tags, which CommonMark passes through and Obsidian renders.
 */

import { visit } from "unist-util-visit";
import { visitParents } from "unist-util-visit-parents";

import { extractHighlightColor, styleStr } from "./element";
import { PASS, stringifyAs } from "./types";
import { extHighlight, type ExtHighlightMark, type InlineHtmlMark } from "../model/nodes";

import type { Root as HRoot } from "hast";
import type { Delete, PhrasingContent, Root as MRoot } from "mdast";
import type { SyntaxFeature } from "./types";

type InlineHtmlTag = InlineHtmlMark["type"];

/**
 * Serialize a phrasing container as an inline HTML tag.
 *
 * The node keeps real `children`, so nested marks survive: `<u>a
 * <strong>b</strong></u>` becomes `<u>a **b**</u>` rather than flattening to
 * the bare text `<u>a b</u>`. CommonMark treats the tag as raw inline HTML
 * and keeps parsing markdown around it, so Obsidian renders the nested
 * emphasis and the next `html2md` sees the original structure again.
 */
function inlineHtmlMark(tag: InlineHtmlTag) {
    return stringifyAs<InlineHtmlMark>((node, _parent, state, info) => {
        const open = `<${tag}>`;
        const close = `</${tag}>`;
        const inner = state.containerPhrasing(node, {
            ...info,
            before: open,
            after: close,
        });
        return open + inner + close;
    });
}

export const marksFeature: SyntaxFeature = {
    name: "marks",

    hastHandlers: () => ({
        // Zotero's strike mark is a styled span, not <del>.
        // Zotero's background-color highlights are also styled spans.
        span: (state, node) => {
            const style = styleStr(node);
            if (style.includes("text-decoration: line-through")) {
                const del: Delete = {
                    type: "delete",
                    children: state.all(node) as PhrasingContent[],
                };
                return del;
            }
            const hlColor = extractHighlightColor(style);
            if (hlColor !== null) {
                return extHighlight(hlColor, state.all(node));
            }
            return PASS;
        },

        // HTML <mark> → default yellow highlight
        mark: (state, node) => extHighlight("yellow", state.all(node)),

        // <u>/<sub>/<sup> → phrasing containers of the same name.
        // <u> serializes as Extended Markdown ++text++
        u: (state, node) => markNode("u", state.all(node)),
        sub: (state, node) => markNode("sub", state.all(node)),
        sup: (state, node) => markNode("sup", state.all(node)),
    }),

    stringifyHandlers: () => ({
        // Underline serializes to Obsidian Extended Markdown ++text++
        u: stringifyAs<InlineHtmlMark>((node, _parent, state, info) => {
            const inner = state.containerPhrasing(node, {
                ...info,
                before: "+",
                after: "+",
            });
            return `++${inner}++`;
        }),

        // Highlights serialize to Obsidian Extended Markdown =={color}text== or ==text==
        extHighlight: stringifyAs<ExtHighlightMark>(
            (node, _parent, state, info) => {
                const open =
                    node.color === "yellow" ? "==" : `=={${node.color}}`;
                const close = "==";
                const inner = state.containerPhrasing(node, {
                    ...info,
                    before: "=",
                    after: "=",
                });
                return `${open}${inner}${close}`;
            },
        ),

        sub: inlineHtmlMark("sub"),
        sup: inlineHtmlMark("sup"),
    }),

    /**
     * GFM `~~strike~~` becomes `<del>`, but Zotero's schema expresses strike
     * as a styled span. Rewrite on the way out.
     */
    transformHast(tree: HRoot) {
        visit(tree, "element", (node) => {
            if (node.tagName === "del") {
                node.tagName = "span";
                node.properties.style = "text-decoration: line-through";
            } else if (node.tagName === "mark") {
                node.tagName = "span";
                node.properties.style = "background-color: #ffd400";
            }
        });
    },

    transformMdastIn(tree: MRoot) {
        normalizeEmphasisWhitespace(tree);
    },
};

function markNode(tag: InlineHtmlTag, children: unknown): InlineHtmlMark {
    return { type: tag, children: children as PhrasingContent[] };
}

/**
 * Move leading/trailing whitespace out of `emphasis` and `strong` nodes so
 * that remark-stringify does not HTML-encode them.
 *
 * Zotero's note editor frequently places the trailing space *inside* the
 * closing tag — e.g. `<strong>world; </strong>` or `<em>Timaeus </em>51 B`.
 * rehype→remark preserves this, producing e.g. strong("world; ").
 * remark-stringify then notices the closing `**` is preceded by whitespace
 * (which CommonMark forbids for a right-flanking delimiter) and escapes the
 * space as `&#x20;`, which Obsidian renders literally.
 *
 * By moving the whitespace *outside* the node before stringifying we get
 * `**world;** such is …` and `*Timaeus* 51 B` — valid CommonMark that
 * renders correctly.
 *
 * Mutations are collected first and applied in reverse document order so
 * earlier indices are not invalidated by insertions.
 */
function normalizeEmphasisWhitespace(tree: MRoot): void {
    type Patch = { parent: { children: unknown[] }; idx: number };
    const patches: Patch[] = [];

    visitParents(
        tree,
        (n) => n.type === "emphasis" || n.type === "strong",
        (node, ancestors) => {
            const parent = ancestors[ancestors.length - 1] as
                | { children?: unknown[] }
                | undefined;
            if (!parent?.children) return;
            const idx = parent.children.indexOf(node);
            if (idx === -1) return;

            const children = (
                node as {
                    children?: Array<{ type: string; value?: string }>;
                }
            ).children;

            if (!children || children.length === 0) {
                patches.push({
                    parent: parent as { children: unknown[] },
                    idx,
                });
                return;
            }

            const first = children[0];
            const last = children[children.length - 1];
            const needsLeading =
                first?.type === "text" &&
                typeof first.value === "string" &&
                /^\s/.test(first.value);
            const needsTrailing =
                last?.type === "text" &&
                typeof last.value === "string" &&
                /\s$/.test(last.value);
            if (needsLeading || needsTrailing) {
                patches.push({
                    parent: parent as { children: unknown[] },
                    idx,
                });
            }
        },
    );

    // Reverse so that higher indices are processed first; inserting nodes
    // after idx+N does not shift earlier indices within the same parent.
    patches.reverse();

    for (const { parent, idx } of patches) {
        const node = parent.children[idx] as
            | { children?: Array<{ type: string; value: string }> }
            | undefined;
        if (!node) continue;

        if (!node.children || node.children.length === 0) {
            const newIdx = parent.children.indexOf(node);
            if (newIdx !== -1) parent.children.splice(newIdx, 1);
            continue;
        }

        // Strip and hoist trailing whitespace
        const last = node.children[node.children.length - 1];
        let trailingWs = "";
        if (last?.type === "text" && typeof last.value === "string") {
            const m = /(\s+)$/.exec(last.value);
            if (m) {
                trailingWs = m[1]!;
                last.value = last.value.slice(0, -trailingWs.length);
                if (!last.value) node.children.pop();
            }
        }

        // Strip and hoist leading whitespace
        const first = node.children[0];
        let leadingWs = "";
        if (first?.type === "text" && typeof first.value === "string") {
            const m = /^(\s+)/.exec(first.value);
            if (m) {
                leadingWs = m[1]!;
                first.value = first.value.slice(leadingWs.length);
                if (!first.value) node.children.shift();
            }
        }

        // Insert extracted whitespace outside the node.
        // Insert trailing first (higher index) so leading insertion index
        // stays correct.
        if (trailingWs) {
            parent.children.splice(idx + 1, 0, {
                type: "text",
                value: trailingWs,
            });
        }
        if (leadingWs) {
            parent.children.splice(idx, 0, {
                type: "text",
                value: leadingWs,
            });
        }

        // If the node is now empty (was purely whitespace), remove it.
        if (!node.children.length) {
            const newIdx = parent.children.indexOf(node);
            if (newIdx !== -1) parent.children.splice(newIdx, 1);
        }
    }
}
