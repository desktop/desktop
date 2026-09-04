# File Mode Change Diff Empty State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the old and new Git file mode when a permission-only file change has no content hunks.

**Architecture:** Parse `old mode` and `new mode` lines from the existing unified-diff header, carry that optional data on text diffs, and render an additional line in the existing empty diff panel.

**Tech Stack:** TypeScript, React, Node.js built-in tests, Testing Library.

**Spec:** `docs/superpowers/plans/2026-09-04-diff-mode-change.md` (bounded design approved in session).

## Global Constraints

- Preserve the exact existing empty-state message `No content changes found`.
- Render Git modes exactly, for example `File mode changed from 100644 to 100755`.
- Only extend the no-hunks empty state; do not add a separate banner to content diffs.
- Keep changes surgical and do not alter staging, line ending warnings, binary diffs, or image diffs.
- Add test rationale comments and a `docs/test-change-log.md` entry for every logical test change.

---

### Task 1: Capture file-mode change from the diff header

**Files:**
- Modify: `app/src/models/diff/diff-data.ts`
- Modify: `app/src/models/diff/raw-diff.ts`
- Modify: `app/src/lib/diff-parser.ts`
- Test: `app/test/unit/diff-parser-test.ts`

**Interfaces:**
- Produces: `export type FileModeChange = { readonly from: string; readonly to: string }`
- Produces: `IRawDiff.modeChange?: FileModeChange`
- Produces: `ITextDiff.modeChange?: FileModeChange` and `ILargeTextDiff.modeChange?: FileModeChange`

- [ ] **Step 1: Add a failing parser test**

Add to `app/test/unit/diff-parser-test.ts` inside the existing `describe('DiffParser')`:

```ts
it('parses file mode changes from mode-only diffs', () => {
  const diffText = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`

  const parser = new DiffParser()
  const diff = parser.parse(diffText)

  assert.equal(diff.hunks.length, 0)
  assert.deepEqual(diff.modeChange, {
    from: '100644',
    to: '100755',
  })
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `yarn test app/test/unit/diff-parser-test.ts`

Expected: FAIL because `diff.modeChange` is not defined.

- [ ] **Step 3: Parse the mode change minimally**

In `app/src/models/diff/diff-data.ts`, add the new `FileModeChange` type and optional `modeChange` field to `ITextDiffData`.

In `app/src/models/diff/raw-diff.ts`, add the same optional field to `IRawDiff`.

In `app/src/lib/diff-parser.ts`, extend the private header-info result with `modeChange?: FileModeChange`, parse lines matching `/^(old|new) mode ([0-7]{6})$/` while reading the diff header, and only return `modeChange` when both values were found.

- [ ] **Step 4: Run the focused parser tests**

Run: `yarn test app/test/unit/diff-parser-test.ts`

Expected: PASS, including existing parser behavior.

- [ ] **Step 5: Commit parser support**

Run: `git add app/src/models/diff/diff-data.ts app/src/models/diff/raw-diff.ts app/src/lib/diff-parser.ts app/test/unit/diff-parser-test.ts docs/test-change-log.md && git commit -m "feat: capture file mode changes in diffs"`

### Task 2: Propagate mode change through text diffs

**Files:**
- Modify: `app/src/lib/git/diff.ts`
- Modify: `app/src/ui/diff/diff-helpers.tsx`
- Test: existing type/check coverage from Task 1 and Task 3

**Interfaces:**
- Consumes: `IRawDiff.modeChange?: FileModeChange`
- Produces: `ITextDiff.modeChange?: FileModeChange` and `ILargeTextDiff.modeChange?: FileModeChange`

- [ ] **Step 1: Propagate the field**

Add `modeChange: diff.modeChange` to both `convertDiff` and `buildDiff` when constructing `ITextDiff` and `ILargeTextDiff`.

Update `textDiffEquals` to compare the optional mode change so a mode-only diff re-render is not incorrectly treated as unchanged.

- [ ] **Step 2: Verify compilation and focused parser tests**

Run: `yarn test app/test/unit/diff-parser-test.ts && yarn tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit propagation**

Run: `git add app/src/lib/git/diff.ts app/src/ui/diff/diff-helpers.tsx && git commit -m "feat: propagate file mode changes through text diffs"`

### Task 3: Render the mode change in the empty diff state

**Files:**
- Modify: `app/src/ui/diff/index.tsx`
- Create: `app/test/unit/ui/diff-empty-state-test.tsx`
- Create: `docs/test-change-log.md`

**Interfaces:**
- Consumes: `ITextDiff.modeChange?: FileModeChange`

- [ ] **Step 1: Add a failing UI test**

Create `app/test/unit/ui/diff-empty-state-test.tsx` with a rationale comment explaining that the test protects the new empty-state explanation and prevents the parser data from being lost at the rendering boundary.

```tsx
import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  FileModeChange,
} from '../../../src/models/diff'
import { ImageDiffType } from '../../../src/models/diff/image-diff'
import { AppFileStatusKind } from '../../../src/models/status'
import { Repository } from '../../../src/models/repository'
import { WorkingDirectoryFileChange } from '../../../src/models/status'
import { Diff } from '../../../src/ui/diff'
import { render, screen } from '../../helpers/ui/render'

function renderEmptyDiff(modeChange?: FileModeChange) {
  const file = new WorkingDirectoryFileChange(
    'script.sh',
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )

  render(
    <Diff
      repository={new Repository('/tmp/desktop-mode-diff-test', 1, null, false)}
      readOnly={true}
      file={file}
      diff={{
        kind: DiffType.Text,
        text: '',
        hunks: [],
        maxLineNumber: 0,
        hasHiddenBidiChars: false,
        modeChange,
      }}
      fileContents={null}
      imageDiffType={ImageDiffType.TwoUp}
      hideWhitespaceInDiff={false}
      showSideBySideDiff={false}
      showDiffCheckMarks={false}
      onOpenBinaryFile={() => {}}
      onChangeImageDiffType={() => {}}
      onHideWhitespaceInDiffChanged={() => {}}
    />
  )
}

describe('Diff empty state', () => {
  it('explains a mode-only change with the old and new Git file mode', () => {
    renderEmptyDiff({ from: '100644', to: '100755' })

    assert.ok(screen.getByText('No content changes found'))
    assert.ok(
      screen.getByText('File mode changed from 100644 to 100755')
    )
  })

  it('keeps the unchanged empty-state message without a mode change', () => {
    renderEmptyDiff()

    assert.ok(screen.getByText('No content changes found'))
    assert.ok(screen.queryByText(/File mode changed from/) === null)
  })
})
```

- [ ] **Step 2: Run the focused UI test and confirm it fails**

Run: `yarn test app/test/unit/ui/diff-empty-state-test.tsx`

Expected: FAIL because the mode-change line is not rendered.

- [ ] **Step 3: Render the mode change**

In `app/src/ui/diff/index.tsx`, replace the unconditional final empty-state return with a fragment containing the original text and, when `diff.modeChange` is present, a second line using `File mode changed from ${diff.modeChange.from} to ${diff.modeChange.to}`.

- [ ] **Step 4: Run focused UI tests**

Run: `yarn test app/test/unit/ui/diff-empty-state-test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit UI support**

Run: `git add app/src/ui/diff/index.tsx app/test/unit/ui/diff-empty-state-test.tsx docs/test-change-log.md && git commit -m "feat: show file mode changes in empty diffs"`

### Task 4: Validation

**Files:**
- No source changes

- [ ] **Step 1: Run focused tests**

Run: `yarn test app/test/unit/diff-parser-test.ts app/test/unit/ui/diff-empty-state-test.tsx`

Expected: PASS.

- [ ] **Step 2: Run formatting and lint**

Run: `yarn prettier --check app/src/lib/diff-parser.ts app/src/models/diff/diff-data.ts app/src/models/diff/raw-diff.ts app/src/lib/git/diff.ts app/src/ui/diff/diff-helpers.tsx app/src/ui/diff/index.tsx app/test/unit/diff-parser-test.ts app/test/unit/ui/diff-empty-state-test.tsx docs/test-change-log.md docs/superpowers/plans/2026-09-04-diff-mode-change.md && yarn lint:src`

Expected: PASS.

- [ ] **Step 3: Review the final diff**

Run: `git status --short && git diff --stat`

Expected: only files listed in this plan and no unrelated changes.
