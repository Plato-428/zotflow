# ZotFlow fork/upstream handoff

Prepared on 2026-09-29 for Stephen. This file records the conversation, verified repository state, decisions, and remaining work. It is a handoff, not an implementation or evidence of a completed merge.

## 1. Project overview and goal

ZotFlow is an Obsidian plugin that connects a vault to Zotero, renders library source notes through LiquidJS templates, synchronizes supported edits, and embeds a document reader. It uses TypeScript, a main-thread/worker architecture, and Dexie/IndexedDB for worker-side storage.

Stephen maintains `Plato-428/zotflow`, forked from `duanxianpi/zotflow`. He initially requested an extensive comparison of both repositories before merging upstream changes, with an explanation of compatible features and conflicts. He then asked how to minimize future merge conflicts and move presentation customizations into his LiquidJS source-note template wherever practical.

The comparison is substantially complete. No merge, customization refactor, template edit, build deployment, or GitHub push has been performed.

The intended result is an updated fork based on the current stable upstream release, retaining Stephen's metadata editing and underline/highlight support while reducing custom source-code overlap. The carefully tuned source-note template must remain intact. The requirements below describe that target; the repository-state section distinguishes completed preparation from remaining implementation.

## 2. Non-negotiable customization decisions

### Preserve the source-note template

Live template:

`D:\Documents\Notebooks\Obsidian\Vault\Other\Templates\ZotFlow Library Source Note.md`

Explicit user requirements:

- **Do not touch the extensive backslash-removal/unescaping filter chains.** Stephen says their extent was necessary even though he does not remember the original edge case. Do not simplify, consolidate, or remove them on aesthetic grounds.
- **Do not touch the list-level normalization, indentation/tab adjustments, blank-line removal, paragraph/list spacing, or related fine-tuned template formatting.** These were deliberately tuned.
- Preserve the existing template layout and cleanup unless a future user instruction specifically changes them.
- Dropping source-code whitespace normalization does **not** mean dropping whitespace/list cleanup in the template. These are separate decisions.

Template SHA-256, verified twice during this work including immediately before this handoff:

`A1BE76B8770A78AB7C747A5AD71EC1A580DE169645D6BEC89B2F93865D2D3316`

The template has not been edited. Use this as a baseline, but respect later user edits rather than restoring this version automatically.

### Keep/re-port these fork capabilities

- Bidirectional abstract editing and synchronization with Zotero.
- Bidirectional ordinary tags, reading status, and ratings; status and ratings are encoded as special Zotero tags.
- Existing abstract/tag editable-region support and correct permission checks.
- Automatic timestamp-based conflict resolution for eligible abstract/tag metadata differences, unless the user chooses a different policy later.
- Underlining with `++...++` and highlighting, including the existing colored-highlight syntax `=={color}...==` and applicable plain highlights. Preserve round trips between Zotero HTML and Markdown, including editable child notes. Template-only forward replacements cannot implement the reverse direction.

### Deliberately drop these customizations

- Fork-specific source-code whitespace normalization, including repairs for trailing whitespace inside italic/bold marks. Stephen has largely fixed the Zotero selection behavior that motivated it and accepts upstream conversion behavior.
- Custom subscript `~...~` and superscript `^...^` syntax. Stephen does not use them. Use upstream handling, including HTML where appropriate.

### Architecture preference

- Prefer template-level presentation when it can work without altering the protected filter chains.
- Keep necessary source extensions small and isolated from upstream files that change frequently.
- Use upstream converter feature modules rather than restoring the fork's entire old converter.
- Keep upstream sync bugfixes and isolate the custom metadata-resolution policy.
- A field-by-field three-way metadata merge was discussed as a possible improvement, **not selected or implemented**. Do not silently change the existing conflict policy to this larger design.

## 3. Actual project state at handoff

Project folder / required location for future local repository work:

`D:\App Files\Scripts\ZotFlow`

Shell: PowerShell on Windows. Time zone: America/New_York.

Verified immediately before writing this file:

- The project folder contains a successful clone of `https://github.com/Plato-428/zotflow.git`.
- Current branch: `master`, tracking `origin/master`.
- HEAD: `fcf3564fc293cbdf744e5bf0847fb20270d2ae45`.
- Working tree was clean before adding this file. This handoff file will be an untracked local file unless the receiving agent explicitly commits it.
- `origin` fetch/push URL: `https://github.com/Plato-428/zotflow.git`.
- **No `upstream` remote exists in this new clone.**
- **Tag `1.6.6` is not present in this new clone.**
- No merge/rebase is in progress. No customization changes have been applied.
- Submodules were not initialized as part of the clone; dependencies were not installed in this project folder.
- No live Obsidian plugin files or template files were changed.

Read the project's `AGENTS.md` fully before implementation. It contains architecture and build requirements. Key constraints include worker-only Dexie access, type-only worker imports from main-thread code, strict TypeScript, lifecycle cleanup, no unsolicited reader source modifications, and running the appropriate plugin build after code changes. The user also pasted most of that guide into the chat. Fetching upstream can change the guide; read the applicable version before editing.

## 4. Upstream target and comparison refs

GitHub's latest-release endpoint was checked live during this turn:

`https://api.github.com/repos/duanxianpi/zotflow/releases/latest`

It returned:

- Latest stable release: **1.6.6**, not a draft or prerelease.
- Release URL: `https://github.com/duanxianpi/zotflow/releases/tag/1.6.6`.
- Published: 2026-09-19 03:51:07 UTC.
- Release notes identify build commit: `8f85e05d51a996c0ad6cc3ad9417f5776eb2363e`.
- Assets: `main.js`, `manifest.json`, `styles.css`.
- Release notes say it was built with `npm ci` and `npm run build:ci`.

Use the release tag as the stable integration target; do not substitute upstream master without checking the difference. Recheck the latest release if resuming at a materially later date.

Earlier detailed comparison used:

| Reference | Commit |
| --- | --- |
| Common ancestor / upstream 1.2.1 | `3c7172820e3b5ee8a254daea5050a448f659cf80` |
| Stephen's fork master | `fcf3564fc293cbdf744e5bf0847fb20270d2ae45` |
| Upstream master snapshot | `ba7cba6bca1f1ba51f56b938567f8733925120fe` |
| Stable 1.6.6 build/tag | `8f85e05d51a996c0ad6cc3ad9417f5776eb2363e` |

At the audit, upstream master was one release-tooling commit ahead of the stable tag. Upstream dev matched master; a separate flow branch was excluded.

Comparison counts: 12 fork-only commits (9 nonmerge), 160 upstream-only commits (157 nonmerge). Fork net changes: 13 files, +1219/-53. Upstream net changes: 286 files, +49412/-10116. These counts refer to the audited master snapshot, not necessarily the stable tag.

## 5. Existing audit material — reuse it

The updated compatibility review is now alongside this handoff:

`D:\App Files\Scripts\ZotFlow\zotflow-upstream-compatibility-review.md`

Use this project-folder version. It has been revised to reflect the final keep/drop decisions, protected template rules, subsequent template inspection, and sync findings. Give the receiving agent this review, this `chatgpt-context.md`, and the repository's `AGENTS.md`: the guide covers architecture/conventions, this handoff covers the task and state, and the review supplies detailed compatibility evidence.

Earlier work is in:

`C:\Users\Stephen\Documents\Codex\2026-09-29\github-plugin-github-openai-curated-remote`

Original audit deliverables:

- `outputs\zotflow-upstream-compatibility-review.md` — extensive review, roughly 30 KB.
- `outputs\zotflow-commit-inventory.md` — commit inventory.

Useful working material:

- `work\zotflow-audit` — earlier Git clone with fork and upstream history, created with no checkout; upstream refs available here.
- `work\fork-source` — extracted audited fork source.
- `work\upstream-source` — extracted upstream source; node_modules installed with `npm ci --ignore-scripts`.
- `work\converter-probe.mjs`, `work\converter-probe-bundle.mjs`, `work\converter-probe-results.json` — actual converter probes.

The original report in the old outputs folder predates some user simplifications and is retained as a historical copy. The revised project-folder review incorporates those decisions. **Use the updated review and this handoff's preserve/drop decisions instead of the original recommendations to retain whitespace/subscript/superscript or simplify protected template filters.** Neither version is evidence that a merge has happened.

Continue repository implementation in the user's requested project folder, not the old analysis directory. The old files are references, not the active checkout.

## 6. Merge conflict map

A previous `git merge-tree --write-tree --name-only master upstream/master` simulation in the audit clone produced tree object `077f118356a306199f20f300f0b308465c3cecb0`. It did not update a branch or working tree.

Eight textual conflicts were found:

1. `src/main.ts`
2. `src/ui/editor/zotflow-editable-region-extension.ts`
3. `src/ui/editor/zotflow-lock-extension.ts`
4. `src/ui/editor/zotflow-region-decoration-extension.ts`
5. `src/worker/convert/html-to-md.ts`
6. `src/worker/convert/md-to-html.ts`
7. `src/worker/services/library-template.ts`
8. `styles.css`

`src/worker/services/item-note.ts` and `sync.ts` auto-merged textually, but need semantic integration and tests. A clean textual merge is not proof that metadata, derived indexes, CSL data, and editor permissions work together.

## 7. Fork implementation details worth retaining

The fork's 13 changed files consist of main.ts; template-context types; three editor extensions; styles.css; `utils/special-tags.ts`; three converter files including annotation-comment; item-note.ts; library-template.ts; sync.ts.

### Metadata and editor integration

- `main.ts` adds a metadata-cache observer, debouncing by file for about two seconds, plus commands.
- The observer calls read-status/rating/tags setters concurrently. It does not reliably distinguish genuine user edits from template regeneration. Separate setters read and rewrite the whole raw item; concurrency could overwrite another setter's update. This is an integration concern to investigate, not a demonstrated fix already made.
- `item-note.ts` adds abstract, read-status, rating, and ordinary tag updates. Abstract edits use `metaMd2html`; normalized equal values are treated as no-ops. Updates stamp raw and normalized modification dates and set the item dirty.
- Generic tag editing preserves special status/rating tags.
- Status tag mappings: `📙 To Read`, `📗 Read`, `💡 New`, `📖 In Progress`. Ratings are stars from 1 to 5; inspect the exact helper rather than re-creating the encoding from this summary.
- Tag writeback converts underscores to spaces. Display normalizes hash prefixes. Preserve the actual existing semantics unless deliberately fixing and testing them.
- Template context exposes `item.readStatus` and `item.rating`, separates special tags from ordinary `item.tags`, and uses metadata HTML-to-Markdown conversion for title/abstract.
- Editable markers include `ABSTRACT` and `TAGS`. Debounce identity includes region type so different region types do not collide.
- Abstract/tags editability depends on bidirectional sync and library write permission, separately from permission to edit child notes. Preserve this distinction when porting upstream's editor refactor.
- Fork default template has an editable abstract; the user's actual template uses frontmatter for tags/status/rating and has no body TAGS region.
- Metadata setters do not update the newer upstream derived `searchTags` index or necessarily invalidate newer autocomplete caches. Review derived-field and cache refresh requirements during integration.

### Converter port

Upstream substantially refactored converters into typed feature modules (`a2d0f8f`). Preserve that architecture. Add isolated underline/color-mark support in the appropriate forward/reverse features rather than restoring old broad regex processing, especially processing that could alter code/math.

`src/worker/convert/annotation-comment.ts` was unchanged upstream relative to the base, so the fork version could survive automatically. It still needs review to remove custom subscript/superscript behavior while retaining required underline/highlight handling and dropping source whitespace tweaks.

Actual upstream probe results included:

- `++underlined++` remains literal; upstream does not supply the fork's underline round trip.
- `=={yellow}highlight==` remains literal and may gain escaping on the reverse trip.
- `H~2~O` is interpreted as strikethrough by the current GFM settings; custom subscript is now deliberately dropped.
- Trailing whitespace inside emphasis can produce encoded-space Markdown. User accepts stock upstream behavior.
- Lists can include blank lines under stock conversion. **Leave the user's template normalization intact.**

## 8. Sync analysis and precise limits

### What the fork adds

The fork adds roughly 122 lines to sync.ts. In item pull, for a locally `updated` item, it checks whether local/remote differences are confined to eligible metadata and then resolves by item timestamps.

`isMetadataOnlyLocalChange`:

- Requires a difference in abstract text or normalized tag-name arrays.
- Sorts tag names for comparison; ignores tag type in that comparison.
- Ignores key, version, dateModified, abstractNote, and tags when checking other fields.
- Requires JSON-stringified equality for all other data fields.
- This compares current local and remote values, **not changes against a last-synced baseline**.

`resolveMetadataByTimestamp`:

- Compares local normalized `item.dateModified` with remote `raw.data.dateModified` using Date.parse.
- Local newer: keep local for upload.
- Remote newer: normalize and accept the remote item, mark synced, record it in changedItems.
- Equal, missing, or invalid timestamps: ordinary conflict handling.

Keeping local copies local raw data, updates envelope/data versions to the current server version, keeps status updated, and clears conflict flags. It does not incorporate remote csljson.

**Existing limitation:** This chooses an entire item version. A local abstract edit and a separate remote tag edit can qualify as metadata-only divergence; choosing the newer side can discard the other independent change. There are no per-field timestamps despite comments that may suggest otherwise. Stephen was informed; a three-way per-field merge is only a possible future improvement.

### What upstream fixes and does not fix

- Commit `8f0d82235e900a0305cc4ec7402d93f679841404`: outgoing upload preparation now copies `raw.data`, not just its envelope. Previously sanitization/date stamping could mutate the stored raw item even on a rejected upload. Adopt this fix. It supports correctness but does not replace the metadata conflict policy. The custom resolver uses a separate normalized local timestamp, so do not claim this fix alone resolves its behavior.
- `a899899`: removes collection conflict machinery because collections are pull-only. Adopt upstream cleanup; it is unrelated to custom item metadata editing.
- `14eb9a9`: types Zotero write payloads/responses. `errorStatus` now checks for a numeric response status/code; shared error formatting is used.
- `fa7c93b`: normalization fixes include stricter date handling. Useful foundations, not automatic conflict resolution.
- `0e6f710`: guards item/collection ancestry traversal against cycles.
- CSL changes fetch `include: data,csljson` and add derived data requirements.
- Existing version-mismatch/HTTP 412 retry behavior and manual keep-local/accept-remote actions predate the fork. Do not describe these as newly upstream replacements.
- Stock upstream still marks remote updates against dirty local items as conflicts. It has no automatic abstract/tag timestamp policy.

`ConflictService` already has item keep-local and accept-remote operations. Keeping local propagates server versions into raw/data and clears conflict flags; accepting remote normalizes the server copy. Those mechanics could potentially be shared to reduce duplicated bookkeeping. However, the public method expects an item already marked as conflict, with server version/serverCopyRaw staged. It is not a direct drop-in inside the custom pull path, and changedItems notification must still be preserved.

Recommended direction discussed: small isolated metadata decision module, narrow sync hook, upstream mechanics and fixes retained, focused behavior tests. Do not blindly restore the old sync service.

Primary source links:

- Fork policy: https://github.com/Plato-428/zotflow/blob/fcf3564fc293cbdf744e5bf0847fb20270d2ae45/src/worker/services/sync.ts#L1187
- Upstream dirty-item handling: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/services/sync.ts#L582
- Upstream manual resolution: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/services/conflict.ts#L153
- Upload fix: https://github.com/duanxianpi/zotflow/commit/8f0d82235e900a0305cc4ec7402d93f679841404

## 9. Upstream features and compatibility considerations

- Editable-region parsing moved into a separate parser. Upstream recognizes NOTE, ANNO, and PERSIST. It does **not** add native ABSTRACT or TAGS metadata bindings.
- `wrap_editable` can interpolate arbitrary marker strings, but that alone does not register editor parsing, permissions, writeback, or synchronization.
- PERSIST preserves local text across regeneration and supports orphan handling. It does not sync arbitrary fields to Zotero and cannot replace the abstract/tags fork features.
- NOTE is for cloud child notes; ANNO handles annotation comments, including local sidecars. Preserve upstream behavior while adding the metadata regions.
- Frontmatter keys with `??` preserve existing values/defaults; ordinary rendered keys can overwrite existing values and mandatory keys win. This does not implement bidirectional metadata. Library behavior partly existed already; upstream fixed related local-template behavior.
- Frontmatter and body are rendered separately; do not assume Liquid assignments carry between them.
- CSL rendering, cache/schema changes, search improvements, and reader updates are generally adoptable but need the custom context/setters to honor new derived data.
- The reader moved to Zotero 10-era code and changed its worker/assets handling. The fork did not modify reader source. Optional Enhancement Pack integration uses its own version/protocol requirements; do not install it unless needed/requested.
- Upstream minimum Obsidian version is 1.13.4 (fork was 1.11.4).
- Release workflows contain upstream-specific enhancement-repository notification/dispatch references. Review before enabling publishing workflows on the fork; do not dispatch against upstream services as an incidental integration step.

## 10. Template observations for later validation

Read the actual template before any future work. It contains:

- Frontmatter fields for citation key, title, creators, year, item type, book/publication, reading status, rating, ordinary tags, PDF links, type icon, abstract, and child-note presence.
- Abstract cleanup including HTML emphasis replacements and extensive backslash/unescaping filters, then strip and ABSTRACT wrapping.
- Child note `html2md` followed by fine-tuned blank-line/list indentation replacements that produce the desired tab levels, then NOTE wrapping.
- Annotation colors that map gray/orange/pink to heading levels and other colors to highlight syntax.
- Annotation comments processed with html2md and protected replacement chains, then ANNO wrapping inside bold markup.

Stock Liquid `replace` is literal string replacement, not regex. `normalize_whitespace` collapses newlines too, so it is not an appropriate substitute for the user's careful formatting. `strip` only trims edges. Custom Liquid filters require source registration. Round-trip semantic conversions still require converter code.

The prior audit noted possibly redundant conversions, but Stephen's later instructions explicitly prohibit touching the protected chains. Treat possible redundancy as intentional until instructed otherwise.

## 11. Verification already completed

On the extracted upstream snapshot, 9 selected test files passed with **800 tests passed**:

- `tests/unit/html-roundtrip.test.ts`
- `tests/unit/md-roundtrip.test.ts`
- `tests/unit/obsidian-syntax.test.ts`
- `tests/unit/editable-regions.test.ts`
- `tests/unit/persist-regions.test.ts`
- `tests/unit/note-links.test.ts`
- `tests/integration/sync-pull.test.ts`
- `tests/integration/sync-push.test.ts`
- `tests/integration/library-template.test.ts`

These are upstream baseline results, **not validation of a merged fork**. There has been no build/test run in the newly cloned project folder, and no changes have been made that require a build yet.

After implementation, meaningful tests should cover preserved underline/highlight round trips (including avoiding code/math corruption); upstream PERSIST alongside ABSTRACT/TAGS permissions; abstract/tag/status/rating updates and derived caches; timestamp policy's local-newer, remote-newer, equal/invalid, and mixed-field cases; rejected uploads preserving data; and rendering the unmodified user template against representative nested lists/paragraphs. Follow the repository build instructions. No need to rerun broad suites repeatedly without new changes or failures.

## 12. Suggested receiving-agent sequence

1. Read this handoff and the applicable AGENTS.md. Check status/remotes; preserve this file and any subsequent user work.
2. Complete retrieval of stable upstream 1.6.6 in this project folder. Configure upstream and fetch release refs; verify the tag's commit.
3. Make the release available locally while preserving the fork branch/history. Clearly report whether it is only fetched, separately checked out, or actually merged.
4. Integrate against the stable tag on an appropriate local branch, adopt upstream architecture, and port only the retained capabilities listed above. Preserve the full template.
5. Validate behavior and build, then report material limitations and remaining work.

## 13. Recent conversation and handoff history

After agreeing on the customization decisions, Stephen requested:

> Please don't touch [the template's list level normalization, stripping lines between paragraphs and lists, etc.] either. Otherwise, please make sure to remember all of these customization steps for later, and for now, you can go ahead and pull the current upstream release. By the way, if you clone the repo locally, please do so in the project folder for our chat: D:\App Files\Scripts\ZotFlow.

The assistant began by cloning the fork and preparing to fetch the current stable release. The fork clone succeeded; the upstream fetch did not complete. Stephen then requested this handoff instead of further implementation:

> Instead of executing yourself, please compact our chat into a chatgpt-context.md file for the purposes of handing off the code execution to another coding agent. Please give as much context as is necessary to ensure the agent has enough details to start tackling this task.

Stephen subsequently confirmed that the handoff should include the future integration steps, and requested that the project overview come first and the recent-message history appear later. The planned work is recorded in section 12; no merge or customization implementation has occurred during preparation of this handoff.
