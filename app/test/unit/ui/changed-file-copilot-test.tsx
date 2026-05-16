import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import {
  AppFileStatusKind,
  GitStatusEntry,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { ChangedFile } from '../../../src/ui/changes/changed-file'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function conflictedFile() {
  return new WorkingDirectoryFileChange(
    'src/conflict.ts',
    {
      kind: AppFileStatusKind.Conflicted,
      entry: {
        kind: 'conflicted',
        action: 'both-modified' as any,
        us: GitStatusEntry.UpdatedButUnmerged,
        them: GitStatusEntry.UpdatedButUnmerged,
      },
      conflictMarkerCount: 1,
    },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

describe('ChangedFile Copilot conflict affordance', () => {
  it('renders a Copilot conflict button next to unresolved conflict warnings', () => {
    let clicked = 0

    render(
      <ChangedFile
        file={conflictedFile()}
        include={true}
        availableWidth={300}
        disableSelection={false}
        focused={false}
        onIncludeChanged={() => {}}
        canResolveConflictsWithCopilot={true}
        onResolveConflictsWithCopilot={() => {
          clicked++
        }}
      />
    )

    const button = screen.getByRole('button', {
      name: 'Resolve conflicts with Copilot',
    })

    fireEvent.click(button)
    assert.equal(clicked, 1)
  })

  it('omits the Copilot conflict button when Copilot conflict resolution is unavailable', () => {
    render(
      <ChangedFile
        file={conflictedFile()}
        include={true}
        availableWidth={300}
        disableSelection={false}
        focused={false}
        onIncludeChanged={() => {}}
        canResolveConflictsWithCopilot={false}
        onResolveConflictsWithCopilot={() => {}}
      />
    )

    assert.equal(
      screen.queryByRole('button', {
        name: 'Resolve conflicts with Copilot',
      }),
      null
    )
  })
})
