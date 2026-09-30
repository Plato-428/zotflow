import { describe, expect, it } from "vitest";
import { listToTabs } from "worker/convert/list-tabs";

describe("listToTabs - Markdown list indentation normalization", () => {
    it("normalizes single-digit ordered lists to pure tabs", () => {
        const input = [
            "1. First item",
            "   1. Sub item 1",
            "   2. Sub item 2",
            "      1. Deep item",
            "2. Second item",
        ].join("\n");

        const expected = [
            "1. First item",
            "\t1. Sub item 1",
            "\t2. Sub item 2",
            "\t\t1. Deep item",
            "2. Second item",
        ].join("\n");

        expect(listToTabs(input)).toBe(expected);
    });

    it("normalizes multi-digit ordered lists without skipping levels or leaving leading spaces", () => {
        const input = [
            "9. Item nine",
            "10. Item ten",
            "    1. Sub item under ten",
            "       1. Deep item under sub",
            "          1. Level four item",
            "       2. Deep item two",
            "       6. Deep item six",
            "       7. Deep item seven",
            "11. Item eleven",
            "    1. Sub item under eleven",
            "    2. Sub item two under eleven",
        ].join("\n");

        const expected = [
            "9. Item nine",
            "10. Item ten",
            "\t1. Sub item under ten",
            "\t\t1. Deep item under sub",
            "\t\t\t1. Level four item",
            "\t\t2. Deep item two",
            "\t\t6. Deep item six",
            "\t\t7. Deep item seven",
            "11. Item eleven",
            "\t1. Sub item under eleven",
            "\t2. Sub item two under eleven",
        ].join("\n");

        expect(listToTabs(input)).toBe(expected);
    });

    it("normalizes mixed ordered, unordered, and task lists", () => {
        const input = [
            "1. Ordered item",
            "   - Unordered bullet",
            "     * Asterisk bullet",
            "       - [x] Completed task",
            "       - [ ] Pending task",
        ].join("\n");

        const expected = [
            "1. Ordered item",
            "\t- Unordered bullet",
            "\t\t* Asterisk bullet",
            "\t\t\t- [x] Completed task",
            "\t\t\t- [ ] Pending task",
        ].join("\n");

        expect(listToTabs(input)).toBe(expected);
    });

    it("handles lists inside blockquotes and callouts correctly", () => {
        const input = [
            "> [!note]",
            "> 1. Callout top item",
            ">    1. Callout sub item",
            ">       1. Callout deep item",
            "",
            "1. Regular top item",
            "   1. Regular sub item",
        ].join("\n");

        const expected = [
            "> [!note]",
            "> 1. Callout top item",
            "> \t1. Callout sub item",
            "> \t\t1. Callout deep item",
            "",
            "1. Regular top item",
            "\t1. Regular sub item",
        ].join("\n");

        expect(listToTabs(input)).toBe(expected);
    });

    it("preserves fenced code blocks and horizontal rules untouched", () => {
        const input = [
            "1. Item before code",
            "",
            "```javascript",
            "   1. Not a list item",
            "      2. Still code",
            "```",
            "",
            "---",
            "",
            "1. Item after code",
            "   1. Sub item",
        ].join("\n");

        const expected = [
            "1. Item before code",
            "",
            "```javascript",
            "   1. Not a list item",
            "      2. Still code",
            "```",
            "",
            "---",
            "",
            "1. Item after code",
            "\t1. Sub item",
        ].join("\n");

        expect(listToTabs(input)).toBe(expected);
    });

    it("supports custom indent string like 2 spaces or 4 spaces", () => {
        const input = [
            "1. Top",
            "   1. Sub",
            "      1. Deep",
        ].join("\n");

        const expectedTwoSpaces = [
            "1. Top",
            "  1. Sub",
            "    1. Deep",
        ].join("\n");

        expect(listToTabs(input, "  ")).toBe(expectedTwoSpaces);
    });

    it("handles list item continuation paragraphs correctly", () => {
        const input = [
            "1. First item",
            "   Continuation paragraph for item 1",
            "   1. Sub item",
            "      Continuation paragraph for sub item",
        ].join("\n");

        const expected = [
            "1. First item",
            "\tContinuation paragraph for item 1",
            "\t1. Sub item",
            "\t\tContinuation paragraph for sub item",
        ].join("\n");

        expect(listToTabs(input)).toBe(expected);
    });
});
