# ZotFlow upstream compatibility review

Reviewed 29 September 2026; revised after the subsequent customization and sync discussions. Assessment only: no merge, customization implementation, or vault/template edits have been made. The fork has since been cloned into `D:\App Files\Scripts\ZotFlow`; upstream retrieval in that clone remains incomplete. See `chatgpt-context.md` in the same folder for the handoff state and next steps.

## Assessment

Most upstream functionality is compatible with your fork's goals. The difficult work is concentrated in two areas: preserving underline and colored-highlight round trips within upstream's rewritten converter, and combining your editable metadata regions with upstream's new persistent/local-note region system. These are incompatible **as currently implemented**, but neither requires abandoning the features you want to retain.

I recommend adopting the upstream architecture and deliberately porting your custom behavior into it. Resolving conflicts by choosing whole files from either side would lose useful functionality. Git's clean merges in the sync and item-note services do not prove that the combined product works.

## Decisions made after the initial review

- **Keep:** bidirectional abstracts, ordinary tags, reading status, ratings, metadata-only timestamp conflict resolution, and underline/highlight round trips (`++...++`, plain highlights where applicable, and `=={color}...==`). Preserve the source-note update commands as well.
- **Drop:** custom source-code whitespace normalization and custom subscript `~...~` / superscript `^...^` syntax. Use upstream converter behavior for these cases.
- **Preserve the template exactly in the protected areas:** extensive backslash-removal/unescaping chains; list-level normalization; indentation/tab adjustments; blank-line removal; and paragraph/list spacing. Dropping source-code whitespace rules does not mean removing any of those template rules.
- **Minimize future source conflicts:** use small converter feature modules and an isolated metadata conflict-policy module with narrow connections to upstream code. Prefer presentation in Liquid where practical, without rewriting the protected template filters.
- **Use stable 1.6.6 as the integration baseline.** Upstream bugfixes improve sync mechanics but do not replace the custom automatic metadata policy. A field-by-field three-way merge remains an optional future design, not part of the agreed behavior.

These decisions supersede the initial recommendation to port the entire Extended Markdown dialect and all custom whitespace behavior.

## Exact scope and evidence

| Reference | Commit | Meaning |
| --- | --- | --- |
| Shared base | `3c7172820e3b5ee8a254daea5050a448f659cf80` | Upstream 1.2.1, 11 July 2026 |
| Your `master` | `fcf3564fc293cbdf744e5bf0847fb20270d2ae45` | Latest fork commit, 14 July 2026; manifest still says 1.2.1 |
| Upstream `master` | `ba7cba6bca1f1ba51f56b938567f8733925120fe` | Current default branch, 18 September 2026; manifest says 1.6.6 |
| Stable 1.6.6 tag | `8f85e05d51a996c0ad6cc3ad9417f5776eb2363e` | Published 19 September UTC |

At the audit, upstream `dev` pointed to the same commit as `master`. That `master` snapshot is one commit beyond the 1.6.6 tag; the extra commit changes stable-release notes. I used the default branches, not the separate upstream `flow` branch. Your two feature branches are represented in your merged `master` history. GitHub's latest-release endpoint was rechecked during the follow-up on 29 September and still returned stable 1.6.6.

The divergence is **12 fork-only commits (9 non-merge commits)** and **160 upstream-only commits (157 non-merge commits)**. Relative to the base, your net changes span **13 files, +1,219/-53 lines**. Upstream spans **286 files, +49,412/-10,116 lines**, including tests, documentation, dependency locks, and submodule pointers—not just application code.

I read the fork's complete net customization diff, inspected the upstream commit history and the affected converter/editor/template/sync/reader/build systems, and simulated a three-way merge using `git merge-tree`. I also ran focused behavior probes and nine existing upstream suites: **800 tests passed**. Those suites covered HTML and Markdown round trips, Obsidian syntax, editable regions, persist regions, note links, sync pull/push, and library templates.

This was not a full plugin build or an Obsidian/Zotero end-to-end test. Reader submodule changes were assessed through their pinned revisions, parent-repository integration, and release history; I did not audit every transitive reader/PDF.js change. Your actual source-note template was subsequently inspected, and its protected formatting rules are incorporated below. Saved plugin settings and live-library behavior remain unverified. The 800 passing tests validate the upstream snapshot, not a merged fork.

Sources: [your pinned fork][fork], [upstream pinned snapshot][upstream], [shared base][base], [upstream comparison][comparison], [1.6.6 release][release].

## What your fork adds

### Editable abstracts and metadata conflict resolution

Your default library source-note template wraps the abstract in `ZF_ABSTRACT_BEG/END` markers. The editor strips the blockquote prefix and sends edits to `ItemNoteService.updateItemAbstract()`. That method converts Markdown bold/italic to Zotero metadata HTML, updates `abstractNote`, timestamps the item, and marks it dirty for sync. If the source note has an `abstract` frontmatter field, the editor also updates that field immediately.

Your pull logic recognizes divergence restricted to `abstractNote` and `tags`, ignoring identity/version/modification-time fields when comparing the rest of the item. It chooses the newer item timestamp; equal or unusable timestamps still become conflicts. Keeping the local version advances its server version so the metadata can be pushed again.

This is item-level last-write-wins for the permitted metadata differences, not independent clocks for each field. For example, a local abstract edit and a remote tag edit are not automatically combined field by field.

### Bidirectional tags, reading status, and ratings

You split Zotero Reading List tags into a separate `read-status` property, and Ethereal Style star tags into `rating`. The template's `item.tags` excludes the first extracted status and rating; the context separately exposes `item.readStatus` and `item.rating`.

The main plugin watches metadata changes, debounces per file, and routes frontmatter changes to three worker methods. Generic tag replacement preserves special status/rating tags; the special setters preserve the other tag categories. Empty values remove the corresponding special tag.

You also support editable `ZF_TAGS` body regions, parsing comma-separated `#Tag_Name` values and updating frontmatter. The built-in template does not emit a TAGS body region, so that feature depends on a custom template. Your tag mapping intentionally preserves literal hashes on write-back and changes underscores to spaces; it is not lossless for arbitrary tag names.

### Extended Markdown and formatting fixes

This subsection describes the existing fork, including features now deliberately being retired. It is not the list of behaviors to re-port.

Your full note pipeline maps underline to `++text++`, subscript to `~text~`, superscript to `^text^`, and recognized Zotero background colors to `=={color}text==`. Reverse conversion understands those forms. Unknown colors stay HTML. Annotation comments separately gain subscript/superscript conversion.

You preserve nested formatting inside those marks, tighten imported lists, and move boundary whitespace outside emphasis/strong nodes before Markdown serialization. Separate `metaHtml2md`/`metaMd2html` helpers handle formatting in titles and abstracts. The final fork diff matters here: an intermediate broad entity-decoding change in the commit history is not the final retained implementation.

### Source-note update commands

You add `update-active-source-note` and `force-update-active-source-note`. They inspect the active note's frontmatter and reuse the existing library/local update services. Force update requests content and image regeneration for library source notes.

Sources: [fork main plugin][fork-main], [fork item-note service][fork-items], [fork sync logic][fork-sync], [fork template][fork-template], [fork conversion code][fork-convert].

## Upstream changes in depth

### 1.3: persistent sections, local editing, links, and CSL

**Persistent sections.** Templates can declare `ZF_PERSIST` blocks whose user-written content survives source-note regeneration. Existing content is extracted before rendering and reinserted afterward. Removed blocks become an orphan section rather than disappearing. Invalid markers refuse the update. These blocks are local-only and remain editable even for read-only libraries.

**Local annotation comments.** Local source notes now expose annotation comments as editable regions. Edits update the attachment's `.zf.json` sidecar and notify an open reader. External PDF annotations remain read-only. The parser handles region boundaries using marker offsets and supports empty regions. Inline ANNO emission appears in intermediate commits but was subsequently retired; current template output uses block markers.

**Two-way note links.** Displayed item notes can translate native Zotero links into Obsidian/ZotFlow links and translate them back for stored Zotero HTML. Supported inputs include selection, PDF/page/annotation navigation, Zotero's newer `open` form, and Better Notes note links. Unresolvable links are retained. `convertNoteLinks` defaults to true.

**Clickable embedded citations and annotations.** Zotero payload spans gain display links, stripped on save, while their underlying citation/annotation data is preserved. Annotation quotes can open their reader location; citation markers can open the source note.

**CSL citations.** New Liquid `citation` and `bibliography` filters use citeproc, with style selection, locale resolution, custom CSL files, style management/preview, annotation page locators, and text/HTML/Markdown output. Sync now fetches and stores CSL-JSON; old items can be backfilled lazily or by command. IndexedDB v5 adds a CSL resource cache. Existing Pandoc, wikilink, and footnote templates still exist; CSL does not force replacing them. Separate filter calls are stateless—document-wide numbering/ibid behavior should not be assumed.

**Other improvements.** Optional single-click tree opening defaults off. Child-note creation rejects invalid parents. Link destinations containing ampersands and bare URL handling are fixed. Restricted HTML in annotation text now receives the conversion previously applied only to comments.

Compatibility: the features are useful and conceptually compatible. Persistent/local editing and CSL require adapting shared editor/template files. Links belong on the new conversion pipeline. [1.3 release description](https://zotflow.peterduan.dev/releases/1.3.0/), [persist implementation][persist], [CSL/template implementation][template], [item-note link integration][items].

### 1.4: converter rewrite and substantial correctness work

The old large conversion files become orchestration around separate syntax features: marks, math, lists, tables, callouts, Obsidian syntax, links, code, annotation images, and Zotero payloads. Typed nodes distinguish opaque Zotero HTML from Markdown constructs. Feature ordering preserves citation and annotation payloads before generic span processing.

The important benefit is safer conversion: code and math can be distinguished from ordinary text before rewriting syntax. Footnotes are preserved as text by omitting the GFM footnote parser. Container-aware escaping protects table structure without unnecessarily escaping wikilinks; list shaping avoids repeatedly nesting extra spans inside existing HTML. Shared note-metadata handling accepts legacy forms consistently.

Upstream also fixes Better BibTeX keys containing dots/hyphens, note-title extraction and entity decoding, invalid date handling, actual source-note path returns, and related-item links that should follow the vault index. Collection/item ancestry walks gain cycle guards. Collection conflict handling is removed because collections are pull-only; item conflicts remain.

The testing system moves to Vitest with fake IndexedDB, fake hosts, and service integration tests. Sync, conflict handling, templates, notes, attachments, annotations, reader bridges, and conversion gain broad coverage.

Compatibility: most correctness fixes are straightforward. **The converter rewrite directly conflicts with your existing Extended Markdown implementation.** Keep the new architecture and implement only the retained underline/highlight syntax within it. The custom whitespace, subscript, and superscript behavior can be retired. [Rewrite commit][rewrite], [current converter design][convert-readme], [normalization][normalize], [sync][sync].

### 1.5: local storage, settings, search, and reader lifecycle

**Zotero storage access.** A desktop option reads imported attachments directly from a configured Zotero storage directory, separately from existing linked-file support. It defaults off. When enabled for supported imported attachments, the implementation takes the disk path directly; it should not be described as a transparent disk-then-cloud fallback. Missing local files/configuration surface errors. Mobile does not use this desktop path.

**Settings/API update.** Settings move into nested pages using newer Obsidian APIs. The minimum supported Obsidian version rises from **1.11.4 to 1.13.4**. Source notes, reader, CSL, citation, cache, sync, and WebDAV settings are reorganized. The default citation-insertion hotkey is removed.

**Tag suggestions.** Fuzzy tag completion is added, with cached suggestion data and invalidation after supported local mutations/completed sync.

**Reader cleanup.** Iframe teardown and unexpected-reload recovery are hardened. Closing a reader releases retained resources and cached state no longer pins closed iframe realms. Document leases own blob URL lifetimes. Later changes enforce one reader instance per document and activate reused tabs correctly, including Android. Although an earlier commit introduces sharing across multiple views, that is no longer the final user-facing behavior: duplicate reader tabs are consolidated.

**Local templates.** Attachment-directory information becomes available to path templates; CRLF frontmatter and local `??` default handling are corrected so user-maintained values survive where intended.

Compatibility: no fork changes directly modify attachment or reader internals. These are good integration candidates, with the platform-version requirement and one-reader-per-document behavior called out explicitly. Tag autocomplete needs an integration hook for your custom mutation paths. [Attachment service][attachment], [manifest][manifest], [reader cache][reader-cache], [autocomplete][autocomplete].

### 1.6: Zotero 10 reader, Document Worker, and Reading Mode

The reader moves to Zotero 10, with subsequent submodule updates to 10.0.2 and 10.0.3. Core PDF processing moves from the old PDF processor to Zotero's Document Worker: annotation import/export, page rotation, and annotation image rendering use the new service.

External annotation extraction computes changes relative to previously imported annotations. It waits for successful processing before mutating stored data, restricts deletions to the external-annotation set, and persists updates transactionally. Processing failure preserves the prior good snapshot. External annotation tags and dates also receive round-trip fixes.

Reading Mode/structured document text is wired to an optional offline Enhancement Pack. The pack can remain disabled as an Obsidian plugin while its files are used. Loading is deferred until the feature is requested. Resource records, hashes, protocol version, and Document Worker identity are checked; the pack version alone is insufficient. The latest pack submodule update is 2.1.0, while the resource protocol major is 2.

These components form one dependency set: reader submodule, document-worker lock, bundled-asset patches, bridge APIs, worker services, extraction tasks, and resource loading. Updating just the reader pointer or only the plugin files is inadequate.

Compatibility: no fundamental conflict with your metadata or Markdown features. This is nevertheless a coordinated subsystem upgrade, not an isolated feature to cherry-pick casually. [Migration commit][worker-migration], [document-worker lock][worker-lock], [SDT integration][sdt], [external annotation task][external-annotations].

### 1.6 maintenance and release infrastructure

Maintenance adds Promise/iterator compatibility patches, lower-memory ONNX allocation retries, rejection/reporting of degraded structured-text extraction, and MathJax compatibility fixes. Search gains diacritic folding and non-Latin free-text matching. Sync verification uses the candidate API key when checking group access; source-note refresh skips trashed items. WebDAV gains Digest authentication alongside the existing path.

CI now exercises lint, test type checking, Vitest, release-script tests, and full builds. Beta/stable release scripts, LF enforcement, and staged publishing are added. Main development is documented on `dev`, with stable publication on `master`. The obsolete separate note-editor submodule is removed; the active `src/ui/note-editor/view.ts` remains, so child-note editing has not been removed.

**Fork-specific caveat:** both the dedicated Enhancement Pack notification workflow and beta workflow contain dispatches to `duanxianpi/zotflow-enhancement-pack`, using `ENHANCEMENT_PACK_DISPATCH_TOKEN`. Their intended upstream automation should not be imported unchanged as your fork's publishing policy. Retarget or disable those dispatch steps while retaining useful test/build checks. [Notification workflow][notify], [beta workflow][beta], [CI][ci].

## Compatibility decisions

| Change | Assessment for your fork | Required treatment |
| --- | --- | --- |
| WebDAV Digest authentication | Low risk relative to fork | Bring over implementation and fixtures; validate against your provider later |
| Candidate-key verification, trashed-item refresh, ancestry guards | Low risk | Preserve alongside custom item metadata sync |
| Better BibTeX keys, titles, dates, note-path fixes | Low risk | Use upstream implementations; retain your separate metadata formatting helpers |
| Single-click tree opening | Low risk | Optional and off by default |
| Local Zotero storage | Low risk relative to fork | Keep optional; verify desktop path/configuration behavior |
| Reader lifecycle/memory fixes | Compatible, coupled changes | Bring matching reader/bridge/cache changes together; note duplicate-tab behavior |
| Zotero 10/Document Worker/Reading Mode | Compatible, substantial integration | Upgrade the matching reader/worker dependencies; validate the optional resource pack if used |
| New CSL renderer | Compatible with adaptation | Combine template/context changes; preserve status/rating/title/abstract mapping and define CSL-data freshness |
| Native/Better Notes links and clickable spans | Compatible with adaptation | Retain new pipeline and payload handling while adding your custom syntax |
| PERSIST and local ANNO editing | Compatible with adaptation | Unify parser, routing, permission checks, decorations, and region identity |
| Fuzzy tag autocomplete | Compatible with adaptation | Update derived search tags and invalidate caches from custom frontmatter/body edits |
| Underline and colored-highlight conversion | Incompatible as-is; retained | Port just these marks to upstream parser/features in both directions |
| Custom subscript/superscript syntax | Deliberately retired | Use upstream handling; do not reserve single `~` for subscript |
| Custom source-code whitespace normalization | Deliberately retired | Accept upstream converter behavior; preserve template spacing/list cleanup |
| Template backslash and list/paragraph filters | Preserve unchanged | Do not simplify, consolidate, or replace the protected chains |
| ABSTRACT/TAGS region handling | Incompatible as-is | Add both marker types to the extracted parser and preserve worker routing |
| Existing Obsidian 1.11.4 compatibility | Incompatible with current upstream requirements | Upgrade to 1.13.4+ or maintain an intentional compatibility backport |
| Fork publishing workflows | Inappropriate unchanged | Retarget/remove upstream-owned dispatches and choose fork release policy |
| Update/force-update commands | Straightforward preservation | Re-add command registrations/handler while merging `main.ts` |

“Low risk” describes the interaction with your 13-file customization. It is not a claim of zero runtime risk or a guarantee that the relevant commits can be independently cherry-picked without their dependencies.

## Confirmed incompatibilities and integration traps

### Extended Markdown has different meanings upstream

I executed upstream's actual converter with these inputs:

| Input | Actual upstream result | Consequence |
| --- | --- | --- |
| `H~2~O` | HTML strikethrough around `2`; round-trip `H~~2~~O` | Accepted stock behavior: custom subscript has been dropped |
| `x^2^` | Literal `x^2^` in HTML | Accepted stock behavior: custom superscript has been dropped |
| `++underlined++` | Literal plus-delimited text in HTML | Underline is not produced |
| `=={yellow}highlight==` | Literal syntax in HTML; leading `=` escaped on return | Highlight meaning/rendering is not retained |
| HTML `<u>`, `<sub>`, `<sup>` | Inline HTML in returned Markdown | Re-port underline; keep upstream subscript/superscript handling |
| HTML background-color span | HTML span in returned Markdown | Upstream does not emit your colored-highlight syntax |
| `<em>Timaeus </em>51 B` | `*Timaeus&#x20;*&#x35;1 B` | Accepted stock behavior; custom boundary-whitespace rules are dropped |
| Simple two-item HTML list with paragraph children | Blank line between returned items | Preserve the user's existing template list/blank-line normalization |

Upstream's GFM configuration accepts single-tilde strike. Since custom subscript is being dropped, there is no need to alter that precedence for the fork. The old fork's whole-string regex replacements also apply inside math/code; the source itself flags the math limitation. Port underline/highlight through the feature system without extending that limitation. Color handling must distinguish ordinary formatting spans from annotation spans with Zotero metadata, whose payload must stay intact.

Your annotation-comment module is unchanged upstream since the base and survives the textual merge. Review this cleanly merged file too: remove its obsolete custom subscript/superscript behavior, retain required formatting, and check consistency with the full item-note converter. A clean merge must not accidentally preserve features that were deliberately dropped.

### The editor parser moved out of the file you customized

Upstream now stores `MARKER_REGISTRY` in `editable-region-parser.ts`. A direct probe recognized NOTE, ANNO, and PERSIST but returned no regions for ABSTRACT or TAGS. Retaining only your service methods or old registry edits will therefore not restore editing.

The combined permission model should allow local-only PERSIST independently of Zotero permissions; route local ANNO to sidecars; require note-edit permissions for cloud NOTE/ANNO; and preserve your metadata-write permission distinction for ABSTRACT/TAGS. Choosing the fork's lock file wholesale loses upstream local/persist behavior; choosing upstream's wholesale loses your distinction.

Retain your `region.type` in debounce identifiers: abstract and tags share the parent item key and must not cancel each other's queued saves. Both versions still track lock state by bare region key, so independent lock behavior for multiple regions on the same item should be checked during the port.

### Template mapping must preserve both products' fields

Upstream adds CSL data and new typed mapping, but still returns ordinary `title`, `abstractNote`, and all tags. Your version converts title/abstract formatting and splits special tags. The merged mapper needs both sets of behavior. Otherwise `readStatus`/`rating` disappear, special tags rejoin the generic list, or abstract editing loses its markers after regeneration.

The actual vault template was inspected during the follow-up. It uses frontmatter for tags, reading status, and rating, and ABSTRACT, NOTE, and ANNO body regions; it has no TAGS body region. It contains substantial backslash cleanup and deliberately tuned list/paragraph normalization. Preserve those chains rather than replacing them with the repository's default template. Its compatibility still needs rendered-output validation after the source integration.

### What belongs in the template, and what still needs source code

The live template is `D:\Documents\Notebooks\Obsidian\Vault\Other\Templates\ZotFlow Library Source Note.md`. Its SHA-256 at handoff was `A1BE76B8770A78AB7C747A5AD71EC1A580DE169645D6BEC89B2F93865D2D3316`; it has not been edited during this work.

Keep layout, existing HTML cleanup, annotation-color presentation, and the current list/spacing rules in the template. Stock Liquid `replace` does literal replacements, not regex; `normalize_whitespace` collapses newlines and is not a substitute for the tuned rules. Frontmatter and body are rendered separately, so assignments should not be assumed to carry between them.

Bidirectional abstract/tag editing, metadata conflict decisions, and reverse underline/highlight conversion require source support. Upstream PERSIST regions preserve local text but do not bind it to Zotero metadata. Although `wrap_editable` can emit arbitrary marker names, emitting ABSTRACT or TAGS alone does not register parsing, editing, or writeback. Upstream therefore does not eliminate these custom features through new region declarations.

### Cleanly merged metadata services still need integration checks

Your `item-note.ts` additions and timestamp-resolution code in `sync.ts` textually merge. Preserve them, but test the new surrounding contracts:

* `applyTagUpdate()` writes raw tags and timestamps without refreshing normalized `searchTags`; upstream search consumes that derived field, and its new autocomplete cache has explicit invalidation in its own UI paths. Your custom edit paths need equivalent maintenance. This is partly an existing fork limitation that the new autocomplete makes more visible.
* Your keep-local timestamp path preserves local raw data and updates its server version, but does not absorb freshly fetched CSL-JSON. Local abstract writes also do not refresh CSL data. Ordinary citations usually do not depend on abstract/tags, so this is a targeted freshness concern, not a reason to reject CSL.
* Your metadata observer launches separate status/rating/generic-tag calls. Each reads and replaces a complete raw tag list. Concurrent changes can overwrite one another; use a combined/serialized mutation when integrating. This risk exists in the fork already.
* Metadata observers run on cache changes, including generated notes and startup indexing. Test that a template refresh cannot feed stale frontmatter back into Zotero. Item-level timestamp resolution also needs cases for simultaneous abstract/tag changes on different devices, equal timestamps, and unrelated remote field changes.

These are code-level findings and targeted test requirements; I did not reproduce them against your live library.

### Upstream sync fixes complement, but do not replace, the metadata policy

The most relevant new bugfix is [the outgoing-payload copy fix][payload-copy]. Upload preparation now copies `raw.data` before sanitizing fields and stamping dates. Previously a rejected upload could leave the stored raw record carrying the upload attempt's changes. Adopt this fix. It does not select the winning metadata version, and the fork's resolver reads the separate normalized local `dateModified`, so the fix alone should not be described as repairing the custom timestamp policy.

Upstream also removes collection conflicts because collections are pull-only, strengthens date normalization, and types upload/error handling. Those changes are useful foundations. Item conflict handling still marks competing local/remote changes for review. Version-mismatch retries and the manual keep-local/accept-remote operations already existed at the fork's common ancestor; they are not newly added replacements.

Keep the fork's narrow metadata decision, ideally in a separate module: only eligible abstract/tag differences qualify; newer local or remote timestamps win; equal/invalid timestamps and unrelated field differences fall back to ordinary conflicts. Reading status/rating participate through their special tags. Upstream's manual resolver has potentially reusable version/normalization bookkeeping, but expects an already-staged conflict and is not a drop-in call from the custom pull path. Preserve changed-item notifications and newer derived-data requirements when consolidating it.

This remains item-level last-write-wins. Combining independent local abstract and remote tag changes without loss would require a baseline-aware, field-by-field design. That is an optional future improvement, not an agreed expansion of this integration.

## Textual merge findings

The simulated merge reported exactly eight conflicted files:

1. `src/main.ts` — preserve metadata observer, teardown, and commands alongside new services and lifecycle changes.
2. `src/ui/editor/zotflow-editable-region-extension.ts` — retain custom saves while using the extracted parser and local/persist routing.
3. `src/ui/editor/zotflow-lock-extension.ts` — combine permission policies.
4. `src/ui/editor/zotflow-region-decoration-extension.ts` — combine custom borders/locks with local/persist support.
5. `src/worker/convert/html-to-md.ts` — port syntax behavior into new feature modules.
6. `src/worker/convert/md-to-html.ts` — implement custom parsing within the new pipeline.
7. `src/worker/services/library-template.ts` — combine default template, context mapping, CSL filters, and link conversion.
8. `styles.css` — preserve ABSTRACT/TAGS styling alongside upstream selectors and cleanup.

Additional required edits will include files that did **not** conflict: the new region parser, converter feature registry/marks, annotation-comment handling, and appropriate cache/data update hooks. There is no longer a reason to change GFM precedence to support custom subscript. The conflict list is a lower bound on integration work and was simulated against the audited master snapshot, not a completed stable-tag merge.

## Recommended integration and validation order

1. Fetch and verify stable **1.6.6** in the project folder, preserving the fork branch/history. Use that tag as the integration foundation; the audited master snapshot adds only release-note machinery beyond it.
2. Port **underline and highlighting only** into the new conversion feature system, preserving nested marks, code/math isolation, and annotation/citation payloads. Drop source whitespace normalization and custom subscript/superscript syntax across all conversion paths. Keep the template's backslash filters and list/paragraph normalization unchanged.
3. Combine NOTE, ANNO, PERSIST, ABSTRACT, and TAGS region parsing/routing. Preserve metadata editability rules, formatting helpers, special-tag context fields, source-note command IDs, and debounce separation. The actual template need not gain a TAGS body region to retain its frontmatter workflow.
4. Adopt upstream sync fixes and isolate the timestamp conflict policy. Make tag mutations coherent and keep search/CSL-derived state consistent. Preserve current conflict semantics; do not silently introduce a field-by-field merge.
5. Integrate the reader/worker subsystem as a complete set. Keep useful CI and adapt upstream-specific publication workflows for the fork.
6. Run appropriate tests, lint/type checks, and the required build. Render the **unchanged** source-note template against representative nested lists, paragraphs, metadata, and annotations. Validate with a disposable vault/library fixture before a normal rollout.

The regression set should include `++underline++`, plain highlights where applicable, and all supported highlight colors in both directions; nested bold/links; code fences and math; upstream tilde/strikethrough and HTML subscript/superscript behavior; protected template unescaping, nested-list indentation, and paragraph/list spacing; empty abstract/status/rating fields; simultaneous tag-category edits; local-newer/remote-newer/equal/invalid timestamps and unrelated field changes; rejected uploads preserving local data; local sidecars; read-only libraries; removed/malformed PERSIST blocks; native/Better Notes/citation links; and reader close/reopen/Reading Mode with missing or incompatible packs. Do not make the tests require the retired custom subscript/superscript or source whitespace behavior.

The resulting fork should retain abstract/tag/status/rating editing, automatic metadata resolution, and underline/highlight round trips while carrying fewer converter customizations. The remaining work is a deliberate port onto upstream's architecture, with the existing source-note template preserved.

[fork]: https://github.com/Plato-428/zotflow/tree/fcf3564fc293cbdf744e5bf0847fb20270d2ae45
[upstream]: https://github.com/duanxianpi/zotflow/tree/ba7cba6bca1f1ba51f56b938567f8733925120fe
[base]: https://github.com/duanxianpi/zotflow/commit/3c7172820e3b5ee8a254daea5050a448f659cf80
[comparison]: https://github.com/duanxianpi/zotflow/compare/3c7172820e3b5ee8a254daea5050a448f659cf80...ba7cba6bca1f1ba51f56b938567f8733925120fe
[release]: https://github.com/duanxianpi/zotflow/releases/tag/1.6.6
[fork-main]: https://github.com/Plato-428/zotflow/blob/fcf3564fc293cbdf744e5bf0847fb20270d2ae45/src/main.ts
[fork-items]: https://github.com/Plato-428/zotflow/blob/fcf3564fc293cbdf744e5bf0847fb20270d2ae45/src/worker/services/item-note.ts
[fork-sync]: https://github.com/Plato-428/zotflow/blob/fcf3564fc293cbdf744e5bf0847fb20270d2ae45/src/worker/services/sync.ts
[fork-template]: https://github.com/Plato-428/zotflow/blob/fcf3564fc293cbdf744e5bf0847fb20270d2ae45/src/worker/services/library-template.ts
[fork-convert]: https://github.com/Plato-428/zotflow/tree/fcf3564fc293cbdf744e5bf0847fb20270d2ae45/src/worker/convert
[persist]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/utils/persist-regions.ts
[template]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/services/library-template.ts
[items]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/services/item-note.ts
[rewrite]: https://github.com/duanxianpi/zotflow/commit/a2d0f8f
[convert-readme]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/convert/README.md
[normalize]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/db/normalize.ts
[sync]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/services/sync.ts
[attachment]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/services/attachment.ts
[manifest]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/manifest.json
[reader-cache]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/services/reader-document-cache.ts
[autocomplete]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/ui/search/autocomplete-data.ts
[worker-migration]: https://github.com/duanxianpi/zotflow/commit/d2ef0e6
[worker-lock]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/document-worker.lock.json
[sdt]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/ui/reader/sdt.ts
[external-annotations]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/src/worker/tasks/impl/batch-extract-external-annotations-task.ts
[notify]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/.github/workflows/notify-enhancement-pack.yml
[beta]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/.github/workflows/beta-release.yml
[ci]: https://github.com/duanxianpi/zotflow/blob/ba7cba6bca1f1ba51f56b938567f8733925120fe/.github/workflows/ci.yml
[payload-copy]: https://github.com/duanxianpi/zotflow/commit/8f0d82235e900a0305cc4ec7402d93f679841404
