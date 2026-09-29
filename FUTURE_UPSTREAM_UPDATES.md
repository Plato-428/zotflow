# ZotFlow: Guide & Prompt for Future Upstream Updates

> **Single Purpose**: Whenever the original ZotFlow plugin creator (`duanxianpi`) publishes a new release (such as `1.7.0` or `1.8.0`), use the prompt below to instruct an AI coding agent to update this repository cleanly and safely.

---

## 1. Copy-Paste Prompt for Future AI Coding Agents

Copy and paste the entire block below into the chat when starting an update task:

```markdown
I need you to update my fork of ZotFlow (Plato-428/zotflow) to upstream's latest stable release (e.g. 1.7.0).

Please follow these strict rules and guidelines:

1. **Repository Safety (CRITICAL GUARDRAIL)**:
   - NEVER push to or open a pull request targeting `duanxianpi/zotflow`. 
   - All commits, branches, and pull requests must strictly target my own repository (`Plato-428/zotflow`).
   - Upstream (`duanxianpi/zotflow`) is purely a read-only source of upstream updates.

2. **Protect the Source-Note Template**:
   - Do NOT touch or edit my live template at:
     `D:\Documents\Notebooks\Obsidian\Vault\Other\Templates\ZotFlow Library Source Note.md`
   - All filter chains, list indentations, and spacing in that template must remain completely intact.

3. **Rebase / Port Strategy**:
   - Fetch the new release tag from `upstream` (e.g. `git fetch upstream --tags`).
   - Create a new integration branch starting from that new upstream tag (e.g. `integrate/upstream-1.7.0`).
   - Replay/rebase our clean customization commits onto the new tag. 
   - Our customizations are designed with minimal touchpoints and live in isolated files:
     - `src/worker/services/metadata-sync-policy.ts` (isolated sync timestamp conflict policy)
     - `src/utils/special-tags.ts` (isolated read-status and rating tag splitting)
     - `src/worker/convert/features/marks.ts` (underline `++...++` and highlight `=={color}...==` AST rules)
     - `src/ui/editor/` (ABSTRACT and TAGS region support in parser and lock extensions)
     - `src/worker/services/item-note.ts` (atomic `updateItemMetadata` helper)
     - `src/main.ts` (debounced metadata observer and update commands)
   - If there are any minor merge conflicts in the hook lines, resolve them while preserving our custom hooks.

4. **Verification**:
   - Run `npm install`
   - Run `npm run typecheck:tests` to ensure strict TypeScript types pass.
   - Run `npx vitest run tests/integration/reader-bridge.test.ts` to confirm the PDF reader works.
   - Run `npm run test:vitest` to verify all unit tests pass (including our tests in `tests/unit/extended-marks.test.ts`, `tests/unit/special-tags.test.ts`, and `tests/unit/metadata-sync-policy.test.ts`).
   - Run `npm run build:plugin` to ensure `main.js` builds with zero errors.

Please explain your plan before executing, keep each component as a separate commit, and write detailed multi-line commit descriptions on GitHub.
```

---

## 2. Architectural Overview: How Our Customizations Are Isolated

To prevent future update headaches, Stephen's fork isolates customizations into dedicated files rather than scattering edits across large upstream files:

| Customization Area | Dedicated File | Hook Location in Upstream Code |
| :--- | :--- | :--- |
| **Sync Conflict Resolution** | `src/worker/services/metadata-sync-policy.ts` | ~5-line check in `src/worker/services/sync.ts` under item pull |
| **Special Tag Splitting** | `src/utils/special-tags.ts` | Called in `src/worker/services/library-template.ts` (`mapToItemContext`) |
| **Underline & Highlights** | `src/worker/convert/features/marks.ts` | Self-contained within upstream's modular `SyntaxFeature` system |
| **Region Parsing** | `src/ui/editor/editable-region-parser.ts` | Two entries added to `MARKER_REGISTRY` (`ABSTRACT` and `TAGS`) |
| **Editor Permissions** | `src/ui/editor/zotflow-lock-extension.ts` | Differentiates metadata permission (`canEditMetadata`) from note permission |
| **Atomic Metadata Sync** | `src/worker/services/item-note.ts` | Method `updateItemMetadata()` called from `src/main.ts` |
| **Metadata Observer & Commands** | `src/main.ts` | Debounced event listener on `app.metadataCache.on("changed")` |

---

## 3. Step-by-Step Manual Git Recipe (If Performing Updates Directly)

If you or an engineer want to run the update directly using the command line:

1. **Fetch upstream updates**:
   ```bash
   git fetch upstream --tags
   ```

2. **Create a fresh update branch from the new tag**:
   ```bash
   git checkout -b integrate/upstream-1.7.0 1.7.0
   ```

3. **Rebase your customization commits onto the new tag**:
   ```bash
   git rebase --onto integrate/upstream-1.7.0 <previous-upstream-tag> master
   ```

4. **Verify the build**:
   ```bash
   npm install
   npm run typecheck:tests
   npm run test:vitest
   npm run build:plugin
   ```

5. **Deploy the built plugin to your Obsidian vault**:
   Copy `main.js`, `manifest.json`, and `styles.css` into your vault:
   `<Vault>/.obsidian/plugins/obsidian-zotflow/`
