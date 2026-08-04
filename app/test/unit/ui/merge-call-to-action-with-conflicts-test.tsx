import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { ComputedAction } from '../../../src/models/computed-action'
import { MultiCommitOperationKind } from '../../../src/models/multi-commit-operation'
import { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { MergeCallToActionWithConflicts } from '../../../src/ui/history/merge-call-to-action-with-conflicts'
import { fireEvent, render, screen } from '../../helpers/ui/render'

class TestDispatcher {
  public initializedOperations = 0
  public merges = 0

  public initializeMultiCommitOperation() {
    this.initializedOperations++
  }

  public incrementMetric() {}

  public async mergeBranch() {
    this.merges++
  }

  public executeCompare() {}

  public updateCompareForm() {}
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

function createBranch(name: string, sha: string) {
  return new Branch(name, null, { sha }, BranchType.Local, `refs/heads/${name}`)
}

function renderCallToAction(
  dispatcher: TestDispatcher,
  hasConflicts: boolean,
  isMultiCommitOperationInProgress: boolean,
  ref?: React.RefObject<MergeCallToActionWithConflicts>
) {
  return render(
    <MergeCallToActionWithConflicts
      ref={ref}
      repository={new Repository('/tmp/desktop', 1, null, false)}
      dispatcher={toDispatcher(dispatcher)}
      mergeStatus={{ kind: ComputedAction.Clean }}
      currentBranch={createBranch('main', '1111111')}
      comparisonBranch={createBranch('feature', '2222222')}
      commitsBehind={2}
      hasConflicts={hasConflicts}
      isMultiCommitOperationInProgress={isMultiCommitOperationInProgress}
    />
  )
}

describe('MergeCallToActionWithConflicts', () => {
  it('disables updates and explains an active conflict', () => {
    const dispatcher = new TestDispatcher()
    const view = renderCallToAction(dispatcher, true, false)
    const button = screen.getByRole('button', {
      name: 'Create a merge commit',
    })
    const warning = screen.getByRole('status')

    assert.strictEqual(button.getAttribute('aria-disabled'), 'true')
    assert.strictEqual(
      warning.textContent,
      'Resolve the conflicts or abort the current operation before updating this branch.'
    )
    assert.strictEqual(button.getAttribute('aria-describedby'), warning.id)
    assert.notStrictEqual(
      view.container.querySelector('.merge-status-conflicts'),
      null
    )
  })

  it('disables updates while another multi-commit operation is in progress', () => {
    const dispatcher = new TestDispatcher()
    renderCallToAction(dispatcher, false, true)

    const button = screen.getByRole('button', {
      name: 'Create a merge commit',
    })

    assert.strictEqual(button.getAttribute('aria-disabled'), 'true')
  })

  it('guards against stale invocation while conflicts are active', async () => {
    const dispatcher = new TestDispatcher()
    const ref = React.createRef<MergeCallToActionWithConflicts>()
    renderCallToAction(dispatcher, true, false, ref)

    const instance = ref.current as unknown as {
      onOperationInvoked(
        event: React.MouseEvent<HTMLButtonElement>,
        option: { readonly id: string; readonly label: string }
      ): Promise<void>
    }
    await instance.onOperationInvoked(
      { preventDefault() {} } as React.MouseEvent<HTMLButtonElement>,
      {
        id: MultiCommitOperationKind.Merge,
        label: 'Create a merge commit',
      }
    )

    assert.strictEqual(dispatcher.initializedOperations, 0)
    assert.strictEqual(dispatcher.merges, 0)
  })

  it('preserves the existing update behavior when the repository is ready', async () => {
    const dispatcher = new TestDispatcher()
    renderCallToAction(dispatcher, false, false)

    const button = screen.getByRole('button', {
      name: 'Create a merge commit',
    })

    assert.strictEqual(button.hasAttribute('aria-disabled'), false)
    fireEvent.click(button)

    assert.strictEqual(dispatcher.initializedOperations, 1)
    assert.strictEqual(dispatcher.merges, 1)
  })
})
