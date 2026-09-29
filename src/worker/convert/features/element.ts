/**
 * Small typed readers for hast element properties.
 *
 * hast stores `properties` loosely — `className` arrives parsed into an array
 * or missing entirely, `style` as a string or missing. These keep the
 * narrowing in one place instead of at every call site.
 */

import type { Element } from "hast";

/** `className` as a string array. Empty when the attribute is absent. */
export function classNames(node: Element): string[] {
    const raw = node.properties.className;
    return Array.isArray(raw) ? raw.map(String) : [];
}

/** Whether the element carries a given class. */
export function hasClass(node: Element, name: string): boolean {
    return classNames(node).includes(name);
}

/** Inline `style` as a string. Empty when the attribute is absent. */
export function styleStr(node: Element): string {
    const raw = node.properties.style;
    return typeof raw === "string" ? raw : "";
}

/**
 * Maps Zotero's highlight hex colors to Extended Markdown Syntax color names.
 * Colors not in this map are left as raw HTML (passthrough).
 */
export const ZOTERO_HEX_TO_COLOR: Readonly<Record<string, string>> = {
    "#ffd400": "yellow",
    "#ff6666": "red",
    "#f19837": "orange",
    "#5fb236": "green",
    "#2ea8e5": "cyan",
    "#a28ae5": "purple",
    "#e56eee": "pink",
};

/**
 * Maps Extended Markdown color names to Zotero hex colors.
 */
export const COLOR_TO_ZOTERO_HEX: Readonly<Record<string, string>> = {
    yellow: "#ffd400",
    red: "#ff6666",
    orange: "#f19837",
    green: "#5fb236",
    cyan: "#2ea8e5",
    blue: "#2ea8e5", // alias for cyan
    purple: "#a28ae5",
    pink: "#e56eee",
};

/**
 * Extract the `background-color` value from an inline style string and map it
 * to an Extended MD color name. Returns `null` for unknown/missing colors.
 */
export function extractHighlightColor(style: string): string | null {
    const m = /background-color:\s*([^;]+)/i.exec(style);
    if (!m) return null;
    const raw = m[1]!.trim().toLowerCase();
    return ZOTERO_HEX_TO_COLOR[raw] ?? null;
}
