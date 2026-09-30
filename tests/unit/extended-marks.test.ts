import { describe, it, expect } from "vitest";
import { ConvertService } from "worker/services/convert";
import { metaHtml2md, metaMd2html, annoHtml2md, annoMd2html } from "worker/convert/annotation-comment";
import { COLOR_TO_ZOTERO_HEX, ZOTERO_HEX_TO_COLOR } from "worker/convert/features/element";

const convert = new ConvertService();

describe("extended-marks: underline and colored highlights", () => {
    describe("Underline (++...++)", () => {
        it("converts ++text++ to <u>text</u> in md2html", async () => {
            const md = "This is ++underlined text++ in markdown.";
            const html = await convert.md2html(md);
            expect(html).toContain("<u>underlined text</u>");
        });

        it("converts <u>text</u> to ++text++ in html2md", async () => {
            const html = "<p>This is <u>underlined text</u> in html.</p>";
            const md = await convert.html2md(html);
            expect(md).toContain("++underlined text++");
        });

        it("round trips ++text++ through MD -> HTML -> MD", async () => {
            const original = "Some ++underlined words++ in a sentence.";
            const html = await convert.md2html(original);
            const roundTripMd = await convert.html2md(html);
            expect(roundTripMd.trim()).toBe(original);
        });
    });

    describe("Highlight (=={color}...== and ==...==)", () => {
        it("converts plain ==highlight== to default yellow background span", async () => {
            const md = "Plain ==highlighted text== here.";
            const html = await convert.md2html(md);
            expect(html).toContain('<span style="background-color: #ffd400">highlighted text</span>');
        });

        it("round trips plain ==highlight== through MD -> HTML -> MD as ==text==", async () => {
            const original = "Plain ==highlighted text== here.";
            const html = await convert.md2html(original);
            const roundTripMd = await convert.html2md(html);
            expect(roundTripMd.trim()).toBe(original);
        });

        it("converts all named colors to their respective hex background colors in md2html", async () => {
            for (const [name, hex] of Object.entries(COLOR_TO_ZOTERO_HEX)) {
                const md = `Color =={${name}}test text==`;
                const html = await convert.md2html(md);
                expect(html).toContain(`<span style="background-color: ${hex}">test text</span>`);
            }
        });

        it("converts hex background spans back to =={color}...== in html2md", async () => {
            for (const [hex, name] of Object.entries(ZOTERO_HEX_TO_COLOR)) {
                const html = `<p>Test <span style="background-color: ${hex}">colored text</span></p>`;
                const md = await convert.html2md(html);
                if (name === "yellow") {
                    expect(md.trim()).toBe("Test ==colored text==");
                } else {
                    expect(md.trim()).toBe(`Test =={${name}}colored text==`);
                }
            }
        });

        it("round trips non-yellow named colors MD -> HTML -> MD", async () => {
            const nonYellowColors = ["red", "green", "cyan", "purple", "pink", "orange"];
            for (const color of nonYellowColors) {
                const input = `Here is =={${color}}colored mark== in text.`;
                const html = await convert.md2html(input);
                const output = await convert.html2md(html);
                expect(output.trim()).toBe(input);
            }
        });
    });

    describe("Nested formatting", () => {
        it("handles bold nested inside underline ++**bold**++", async () => {
            const md = "++**bold underline**++";
            const html = await convert.md2html(md);
            expect(html).toContain("<u><strong>bold underline</strong></u>");

            const roundTrip = await convert.html2md(html);
            expect(roundTrip.trim()).toBe(md);
        });

        it("handles italic nested inside colored highlight =={green}*italic*==", async () => {
            const md = "=={green}*italic green*==";
            const html = await convert.md2html(md);
            expect(html).toContain('<span style="background-color: #5fb236"><em>italic green</em></span>');

            const roundTrip = await convert.html2md(html);
            expect(roundTrip.trim()).toBe(md);
        });

        it("handles underline nested inside highlight ==++both++==", async () => {
            const md = "==++underlined highlight++==";
            const html = await convert.md2html(md);
            expect(html).toContain('<span style="background-color: #ffd400"><u>underlined highlight</u></span>');

            const roundTrip = await convert.html2md(html);
            expect(roundTrip.trim()).toBe(md);
        });
    });

    describe("Code and math shielding", () => {
        it("does NOT convert ++ or == inside fenced code blocks", async () => {
            const md = [
                "```python",
                "x = ++a++",
                "y = ==b==",
                "```",
            ].join("\n");

            const html = await convert.md2html(md);
            expect(html).not.toContain("<u>");
            expect(html).not.toContain("<span style=\"background-color");
            expect(html).toContain("++a++");
            expect(html).toContain("==b==");
        });

        it("does NOT convert ++ or == inside inline code", async () => {
            const md = "Here is `++not underline++` and `==not highlight==`.";
            const html = await convert.md2html(md);
            expect(html).not.toContain("<u>");
            expect(html).not.toContain("<span style=\"background-color");
            expect(html).toContain("<code>++not underline++</code>");
            expect(html).toContain("<code>==not highlight==</code>");
        });

        it("does NOT convert ++ or == inside inline LaTeX math ($...$)", async () => {
            const md = "Formula: $x ++ y == z$ with math.";
            const html = await convert.md2html(md);
            expect(html).not.toContain("<u>");
            expect(html).not.toContain("<span style=\"background-color");
            expect(html).toContain("$x ++ y == z$");
        });

        it("does NOT convert ++ or == inside display LaTeX math ($$...$$)", async () => {
            const md = [
                "$$",
                "\\int ++x++ ==y==",
                "$$",
            ].join("\n");

            const html = await convert.md2html(md);
            expect(html).not.toContain("<u>");
            expect(html).not.toContain("<span style=\"background-color");
            expect(html).toContain("++x++");
            expect(html).toContain("==y==");
        });
    });

    describe("Annotation and metadata converters", () => {
        it("converts bold and italic in metaHtml2md and metaMd2html", () => {
            const html = "Title with <b>bold</b> and <i>italic</i>.";
            const md = metaHtml2md(html);
            expect(md).toBe("Title with **bold** and *italic*.");

            const backHtml = metaMd2html(md);
            expect(backHtml).toBe(html);
        });

        it("converts bold and italic in annoHtml2md and annoMd2html while preserving sub/sup", () => {
            const html = "Comment with <b>bold</b>, <i>italic</i>, and <sub>sub</sub><sup>sup</sup>.";
            const md = annoHtml2md(html);
            expect(md).toContain("**bold**");
            expect(md).toContain("*italic*");
            expect(md).toContain("<sub>sub</sub>");
            expect(md).toContain("<sup>sup</sup>");

            const backHtml = annoMd2html(md);
            expect(backHtml).toBe(html);
        });
    });

    describe("Emphasis and strong whitespace normalization", () => {
        it("moves trailing space out of <em> to avoid &#x20; entity", async () => {
            const html = "<p><em>Timaeus </em>51 B</p>";
            const md = await convert.html2md(html);
            expect(md).not.toContain("&#x20;");
            expect(md.trim()).toBe("*Timaeus* 51 B");
        });

        it("moves trailing space out of <strong> to avoid &#x20; entity", async () => {
            const html = "<p><strong>world; </strong>such is</p>";
            const md = await convert.html2md(html);
            expect(md).not.toContain("&#x20;");
            expect(md.trim()).toBe("**world;** such is");
        });

        it("moves leading space out of <em>", async () => {
            const html = "<p>before <em>italic</em></p>";
            const md = await convert.html2md(html);
            expect(md.trim()).toBe("before *italic*");
        });

        it("moves both leading and trailing space out of <em>", async () => {
            const html = "<p>before <em> both </em> after</p>";
            const md = await convert.html2md(html);
            expect(md).not.toContain("&#x20;");
            expect(md.trim()).toBe("before *both* after");
        });

        it("removes purely whitespace emphasis without leaving empty tags", async () => {
            const html = "<p>before <em> </em> after</p>";
            const md = await convert.html2md(html);
            expect(md.trim()).toBe("before after");
        });
    });
});

