/**
 * Convert Markdown list indentation to tabs (or a custom indent string).
 *
 * CommonMark stringifiers (such as remark-stringify) indent child list items
 * based on the character length of the parent list marker plus one space.
 * For example:
 *   - Items 1-9 ("1. ") indent children by 3 spaces
 *   - Items 10+ ("10. ") indent children by 4 spaces
 *   - Bullets ("* ") indent children by 2 spaces
 *
 * This function calculates the semantic nesting depth of each list item
 * and normalizes its leading indentation to pure tabs (`\t`), regardless of
 * whether markers are single-digit, multi-digit, bulleted, or inside blockquotes.
 */
export function listToTabs(md: string, indent: string = "\t"): string {
    if (!md) return "";
    const lines = md.split(/\r?\n/);
    const result: string[] = [];
    let inCodeBlock = false;
    let stack: { col: number; minContinuationCol: number }[] = [];
    let currentBqDepth = 0;

    // Thematic breaks: ---, ***, ___, - - -, * * *
    const thematicBreakRegex = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

    // List item: bullets (*, -, +) or numbered (1., 10., etc.) with optional task checkbox [ ]
    const listItemRegex =
        /^([ \t]*)(?:([-*+]|\d+[.)])(?: \[[ xX]\])? )(.*)$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Fenced code blocks
        if (/^\s*`{3,}/.test(line) || /^\s*~{3,}/.test(line)) {
            inCodeBlock = !inCodeBlock;
            result.push(line);
            stack = [];
            continue;
        }
        if (inCodeBlock) {
            result.push(line);
            continue;
        }

        // Check for blockquote prefix (e.g. "> ", ">> ", "> > ")
        const bqMatch = line.match(/^((?:>[ \t]?)+)(.*)$/);
        const bqPrefix = bqMatch ? bqMatch[1]! : "";
        const contentLine = bqMatch ? bqMatch[2]! : line;

        // Count blockquote depth (number of '>' characters)
        let bqDepth = 0;
        for (const ch of bqPrefix) {
            if (ch === ">") bqDepth++;
        }

        if (bqDepth !== currentBqDepth) {
            currentBqDepth = bqDepth;
            stack = [];
        }

        // Check if it's a thematic break (horizontal rule)
        if (thematicBreakRegex.test(contentLine)) {
            result.push(line);
            stack = [];
            continue;
        }

        const match = contentLine.match(listItemRegex);
        if (match) {
            const rawIndent = match[1]!;
            const markerMatch = contentLine
                .substring(rawIndent.length)
                .match(/^(?:[-*+]|\d+[.)])(?: \[[ xX]\])? /);
            const marker = markerMatch ? markerMatch[0] : "";
            const content = contentLine.substring(
                rawIndent.length + marker.length,
            );

            let col = 0;
            for (const ch of rawIndent) {
                if (ch === "\t") col = (Math.floor(col / 4) + 1) * 4;
                else col++;
            }

            if (stack.length === 0) {
                stack.push({ col, minContinuationCol: col + marker.length });
            } else if (col > stack[stack.length - 1]!.col) {
                stack.push({ col, minContinuationCol: col + marker.length });
            } else {
                while (
                    stack.length > 0 &&
                    col < stack[stack.length - 1]!.col
                ) {
                    stack.pop();
                }
                if (stack.length === 0) {
                    stack.push({ col, minContinuationCol: col + marker.length });
                } else {
                    stack[stack.length - 1] = {
                        col,
                        minContinuationCol: col + marker.length,
                    };
                }
            }

            const depth = stack.length - 1;
            result.push(bqPrefix + indent.repeat(depth) + marker + content);
        } else {
            if (contentLine.trim() === "") {
                result.push(line);
            } else {
                // Calculate indentation of non-empty line
                let col = 0;
                let leadingWs = "";
                for (const ch of contentLine) {
                    if (ch === " " || ch === "\t") {
                        leadingWs += ch;
                        if (ch === "\t") col = (Math.floor(col / 4) + 1) * 4;
                        else col++;
                    } else break;
                }

                // If indented and stack has active list items, treat as list item continuation
                if (
                    stack.length > 0 &&
                    col >= stack[stack.length - 1]!.minContinuationCol
                ) {
                    const depth = stack.length - 1;
                    const text = contentLine.substring(leadingWs.length);
                    result.push(bqPrefix + indent.repeat(depth + 1) + text);
                } else {
                    stack = [];
                    result.push(line);
                }
            }
        }
    }

    return result.join("\n");
}
