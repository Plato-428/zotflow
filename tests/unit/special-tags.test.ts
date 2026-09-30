import { describe, it, expect } from "vitest";
import {
    matchReadStatusEmoji,
    isRatingTag,
    obsidianTagToZoteroTag,
    zoteroTagToObsidianTag,
    parseTagsLine,
    splitSpecialTags,
} from "utils/special-tags";

describe("special-tags utilities", () => {
    describe("matchReadStatusEmoji and isRatingTag", () => {
        it("matches registered read status emojis", () => {
            expect(matchReadStatusEmoji("📙 To Read")).toBe("📙");
            expect(matchReadStatusEmoji("📗 Read")).toBe("📗");
            expect(matchReadStatusEmoji("💡 New")).toBe("💡");
            expect(matchReadStatusEmoji("📖 In Progress")).toBe("📖");
            expect(matchReadStatusEmoji("Normal Tag")).toBeUndefined();
            expect(matchReadStatusEmoji("📙")).toBe("📙");
        });

        it("validates star ratings from 1 to 5 stars", () => {
            expect(isRatingTag("⭐")).toBe(true);
            expect(isRatingTag("⭐⭐")).toBe(true);
            expect(isRatingTag("⭐⭐⭐")).toBe(true);
            expect(isRatingTag("⭐⭐⭐⭐")).toBe(true);
            expect(isRatingTag("⭐⭐⭐⭐⭐")).toBe(true);
            expect(isRatingTag("⭐⭐⭐⭐⭐⭐")).toBe(false);
            expect(isRatingTag("⭐ 5 stars")).toBe(false);
            expect(isRatingTag("")).toBe(false);
        });
    });

    describe("obsidianTagToZoteroTag", () => {
        it("replaces underscores with spaces and trims", () => {
            expect(obsidianTagToZoteroTag("Machine_Learning")).toBe("Machine Learning");
            expect(obsidianTagToZoteroTag("  Deep_Learning_Model  ")).toBe("Deep Learning Model");
        });

        it("preserves literal hash prefixes when present", () => {
            expect(obsidianTagToZoteroTag("#important")).toBe("#important");
            expect(obsidianTagToZoteroTag("#my_special_tag")).toBe("#my special tag");
        });
    });

    describe("zoteroTagToObsidianTag", () => {
        it("prepends a single hash and converts spaces to underscores", () => {
            expect(zoteroTagToObsidianTag("Machine Learning")).toBe("#Machine_Learning");
            expect(zoteroTagToObsidianTag("philosophy")).toBe("#philosophy");
        });

        it("strips any existing hash characters to prevent double hashtags", () => {
            expect(zoteroTagToObsidianTag("#important")).toBe("#important");
            expect(zoteroTagToObsidianTag("##nested")).toBe("#nested");
            expect(zoteroTagToObsidianTag("#Tag with Spaces")).toBe("#Tag_with_Spaces");
        });
    });

    describe("parseTagsLine", () => {
        it("parses tags from a formatted line", () => {
            const line = "**Tags:** #science, #computer_science, #artificial_intelligence";
            expect(parseTagsLine(line)).toEqual([
                "#science",
                "#computer science",
                "#artificial intelligence",
            ]);
        });

        it("handles lines with bare tags or no leading prefix", () => {
            const line = "#alpha, #beta_gamma";
            expect(parseTagsLine(line)).toEqual(["#alpha", "#beta gamma"]);
        });

        it("returns empty array when no tags are present", () => {
            expect(parseTagsLine("**Tags:** ")).toEqual([]);
            expect(parseTagsLine("No hashtags here")).toEqual([]);
        });
    });

    describe("splitSpecialTags", () => {
        it("splits status and rating tags out of tag list", () => {
            const tags = [
                { tag: "philosophy" },
                { tag: "📙 To Read" },
                { tag: "history" },
                { tag: "⭐⭐⭐⭐" },
                { tag: "epistemology" },
            ];

            const result = splitSpecialTags(tags);
            expect(result.readStatus).toBe("📙");
            expect(result.rating).toBe("⭐⭐⭐⭐");
            expect(result.remaining).toEqual([
                { tag: "philosophy" },
                { tag: "history" },
                { tag: "epistemology" },
            ]);
        });

        it("handles null, undefined, or empty tags", () => {
            expect(splitSpecialTags(null)).toEqual({
                readStatus: undefined,
                rating: undefined,
                remaining: [],
            });
            expect(splitSpecialTags(undefined)).toEqual({
                readStatus: undefined,
                rating: undefined,
                remaining: [],
            });
            expect(splitSpecialTags([])).toEqual({
                readStatus: undefined,
                rating: undefined,
                remaining: [],
            });
        });

        it("preserves additional special tags if duplicates exist", () => {
            const tags = [
                { tag: "📙 To Read" },
                { tag: "📗 Read" },
                { tag: "⭐⭐⭐" },
                { tag: "⭐⭐" },
            ];

            const result = splitSpecialTags(tags);
            expect(result.readStatus).toBe("📙");
            expect(result.rating).toBe("⭐⭐⭐");
            // Subsequent special tags are kept in remaining
            expect(result.remaining).toEqual([
                { tag: "📗 Read" },
                { tag: "⭐⭐" },
            ]);
        });
    });
});
