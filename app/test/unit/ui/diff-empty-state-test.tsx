// These tests protect the empty diff explanation for mode-only changes. The
// parser preserves the old and new Git modes, and these checks ensure that data
// reaches the renderer without changing the existing no-content message.
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

function renderEmptyDiff(
  modeChange?: FileModeChange,
  options?: { readonly hideWhitespaceInDiff?: boolean }
) {
  const file = new WorkingDirectoryFileChange(
    'script.sh',
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )

  const view = render(
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
      hideWhitespaceInDiff={options?.hideWhitespaceInDiff ?? false}
      showSideBySideDiff={false}
      showDiffCheckMarks={false}
      onOpenBinaryFile={() => {}}
      onChangeImageDiffType={() => {}}
      onHideWhitespaceInDiffChanged={() => {}}
    />
  )

  return view
}

describe('Diff empty state', () => {
  it('explains a mode-only change with the old and new Git file mode', () => {
    renderEmptyDiff({ from: '100644', to: '100755' })

    assert.ok(screen.getByText('No content changes found'))
    assert.ok(screen.getByText('File mode changed from 100644 to 100755'))
  })

  it('keeps the unchanged empty-state message without a mode change', () => {
    renderEmptyDiff()

    assert.ok(screen.getByText('No content changes found'))
    assert.ok(screen.queryByText(/File mode changed from/) === null)
  })

  it('keeps the mode-change explanation when whitespace is hidden', () => {
    renderEmptyDiff(
      { from: '100644', to: '100755' },
      { hideWhitespaceInDiff: true }
    )

    assert.ok(screen.getByText('No content changes found'))
    assert.ok(screen.getByText('File mode changed from 100644 to 100755'))
  })

  it('stacks empty-state messages inside one panel child', () => {
    const view = renderEmptyDiff({ from: '100644', to: '100755' })
    const panel = view.container.querySelector('.panel.empty')

    assert.ok(panel)
    assert.equal(panel.childElementCount, 1)
    assert.equal(panel.firstElementChild?.childElementCount, 2)
  })
})
