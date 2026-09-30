/**
 * Markdown → Zotero note HTML.
 *
 * Pipeline orchestration only. Every syntax decision lives in `./features`,
 * one file per syntax with both directions in it.
 *
 *   md string
 *     → remark parse            (+ ZF_NOTE_META extraction)
 *     → transformMdastOut       feature stage 1
 *     → remark-rehype
 *     → transformHast           feature stage 2
 *     → rehype-stringify
 *     → postSerializeHtml       feature stage 3 (last resort)
 *     → wrapper div restored
 *
 * Nothing here rewrites the raw markdown string before parsing. micromark
 * resolves block and inline structure first, so `code` and `inlineCode` are
 * distinct node types the feature passes simply never visit — a whole-string
 * regex cannot tell prose from the inside of a fence, and used to corrupt any
 * note that documented markdown syntax.
 *
 * Runs entirely in the Web Worker — no DOM dependency.
 */

import { matchLeadingNoteMeta } from "utils/note-meta";
import { COLOR_TO_ZOTERO_HEX } from "./features/element";
import {
    runTransformMdastOut,
    runTransformHast,
    runPostSerializeHtml,
} from "./features";

import type { ConvertProcessors } from "./processors";
import type { FeatureContext } from "./features";

const EXT_MD_COLORS = "yellow|red|orange|green|cyan|blue|purple|pink";
const EXT_MD_COLOR_RE = new RegExp(
    `==\\{(${EXT_MD_COLORS})\\}((?:[^\\n=]|\\n(?!\\n))+?)==`,
    "g",
);
const EXT_MD_DEFAULT_HL_RE = /==(?!\s)((?:[^\n=]|\n(?!\n))+?)(?<!\s)==/g;
const EXT_MD_UNDERLINE_RE = /\+\+((?:[^\n+]|\n(?!\n))+?)\+\+/g;

/**
 * Matches code blocks, inline code, and math spans so they can be shielded
 * from extended markdown replacements.
 */
const SHIELD_RE =
    /(```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\r\n]+?`+|\$\$[\s\S]*?\$\$|\$(?!\s)[^$\r\n]+?(?<!\s)\$)/g;

/**
 * Preprocesses Extended Markdown syntax (++underline++ and =={color}highlight==)
 * in markdown prose into HTML tags before remark parsing, while strictly protecting
 * code fences, inline code, and LaTeX math formulas.
 */
export function preprocessExtendedMarkdown(md: string): string {
    const shields: string[] = [];
    let shielded = md.replace(SHIELD_RE, (match) => {
        const id = shields.length;
        shields.push(match);
        return `\uE000ZF_SHIELD_${id}\uE001`;
    });

    // 1. Colored highlights: =={color}text== -> <span style="background-color: hex">text</span>
    shielded = shielded.replace(
        EXT_MD_COLOR_RE,
        (_match, color: string, text: string) => {
            const hex = COLOR_TO_ZOTERO_HEX[color.toLowerCase()] ?? "#ffd400";
            return `<span style="background-color: ${hex}">${text}</span>`;
        },
    );

    // 2. Default yellow highlights: ==text== -> <span style="background-color: #ffd400">text</span>
    shielded = shielded.replace(EXT_MD_DEFAULT_HL_RE, (_match, text: string) => {
        return `<span style="background-color: #ffd400">${text}</span>`;
    });

    // 3. Underline: ++text++ -> <u>text</u>
    shielded = shielded.replace(EXT_MD_UNDERLINE_RE, (_match, text: string) => {
        return `<u>${text}</u>`;
    });

    // Restore shielded blocks
    if (shields.length > 0) {
        shielded = shielded.replace(
            /\uE000ZF_SHIELD_(\d+)\uE001/g,
            (_match, id: string) => {
                return shields[Number(id)] ?? _match;
            },
        );
    }

    return shielded;
}

/* ================================================================ */
/*  Options                                                         */
/* ================================================================ */

/** Options for Markdown → HTML conversion. */
export interface ConvertOptions {
    /**
     * When `true` (default), single line breaks in markdown are soft breaks
     * (standard CommonMark). When `false`, they become hard breaks (`<br>`)
     * — matching Obsidian with "Strict line breaks" turned off.
     */
    strictLineBreaks?: boolean;
}

function toContext(options?: ConvertOptions): FeatureContext {
    return {
        strictLineBreaks: options?.strictLineBreaks ?? true,
        // Outbound never derives display links; the citation-links feature
        // strips any that came in unconditionally.
        linkCitationSpans: false,
    };
}

/* ================================================================ */
/*  Public API                                                      */
/* ================================================================ */

/**
 * Convert Markdown to Zotero-format note HTML.
 *
 * If the markdown starts with a `<!-- ZF_NOTE_META … -->` comment (injected
 * by `html2md`), the wrapper `<div>` is restored with its original
 * `data-schema-version` / `data-citation-items` attributes.
 *
 * Processors are injected by ConvertService (frozen, reusable).
 */
export async function md2htmlWithProcessors(
    md: string,
    processors: ConvertProcessors,
    options?: ConvertOptions,
): Promise<string> {
    const ctx = toContext(options);

    // Lift the wrapper-div metadata. Anchored at offset 0, so unlike the
    // syntax passes this cannot collide with document content. Accepted
    // spellings — current and legacy — live in utils/note-meta.
    let wrapperAttrs: string | null = null;
    const metaMatch = matchLeadingNoteMeta(md);
    if (metaMatch) {
        wrapperAttrs = metaMatch.attrs;
        md = md.slice(metaMatch.raw.length);
    }

    md = preprocessExtendedMarkdown(md);
    const mdast = processors.parseMarkdown(md);

    runTransformMdastOut(mdast, ctx);

    const hast = await processors.mdastToHast(mdast);
    runTransformHast(hast, ctx);

    let html = processors.stringifyHtml(hast);
    html = runPostSerializeHtml(html, ctx);

    if (wrapperAttrs) html = `<div ${wrapperAttrs}>${html}</div>`;

    return html;
}
