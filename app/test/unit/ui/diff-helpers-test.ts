// These tests keep file-mode changes structurally comparable so repeated diff
// loads do not treat equal mode metadata as a new diff state.
import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  DiffType,
  FileModeChange,
  type ITextDiff,
} from '../../../src/models/diff'
import { textDiffEquals } from '../../../src/ui/diff/diff-helpers'

function createTextDiff(modeChange?: FileModeChange): ITextDiff {
  return {
    kind: DiffType.Text,
    text: '',
    hunks: [],
    maxLineNumber: 0,
    hasHiddenBidiChars: false,
    modeChange,
  }
}

describe('textDiffEquals', () => {
  it('compares equal file mode changes structurally', () => {
    assert.ok(
      textDiffEquals(
        createTextDiff({ from: '100644', to: '100755' }),
        createTextDiff({ from: '100644', to: '100755' })
      )
    )
  })

  it('detects different file mode changes', () => {
    assert.ok(
      !textDiffEquals(
        createTextDiff({ from: '100644', to: '100755' }),
        createTextDiff({ from: '100644', to: '120000' })
      )
    )
  })
})
