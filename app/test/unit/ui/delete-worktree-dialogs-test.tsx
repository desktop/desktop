import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import { IDeleteWorktreeOptions } from '../../../src/models/worktree'
import { DeleteWorktreeDialog } from '../../../src/ui/worktrees/delete-worktree-dialog'
import { DeleteWorktreeFailedDialog } from '../../../src/ui/worktrees/delete-worktree-failed-dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const repository = new Repository('/repo', 1, null, false)
const branch = new Branch(
  'feature',
  null,
  { sha: 'abc123' },
  BranchType.Local,
  'refs/heads/feature'
)
const options: IDeleteWorktreeOptions = {
  isMissing: true,
  checkout: { branch },
}

type DeleteCall = {
  readonly force: boolean | undefined
  readonly options: IDeleteWorktreeOptions | undefined
}

function recordDeletes() {
  const calls = new Array<DeleteCall>()
  const onDeleteWorktree = async (
    _repository: Repository,
    _worktreePath: string,
    force?: boolean,
    options?: IDeleteWorktreeOptions
  ) => {
    calls.push({ force, options })
  }
  return { calls, onDeleteWorktree }
}

function submit(view: ReturnType<typeof render>, label: string) {
  const button = Array.from(view.container.querySelectorAll('button')).find(
    b => b.textContent === label
  )
  assert.notEqual(button, undefined, `no "${label}" button`)
  fireEvent.click(button!)
}

let restoreIpcSend = () => {}

before(async () => {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
  }
})

after(() => restoreIpcSend())

describe('DeleteWorktreeDialog', () => {
  it('forwards the removal options unchanged', async () => {
    const { calls, onDeleteWorktree } = recordDeletes()
    const view = render(
      <DeleteWorktreeDialog
        repository={repository}
        worktreePath="/repo-feature"
        options={options}
        askForConfirmationOnWorktreeRemoval={true}
        onDeleteWorktree={onDeleteWorktree}
        onConfirmWorktreeRemovalChanged={() => {}}
        onDismissed={() => {}}
      />
    )

    submit(view, 'Remove')

    await waitFor(() => assert.equal(calls.length, 1))
    assert.equal(calls[0].force, undefined)
    assert.strictEqual(calls[0].options, options)
  })

  it('does not offer to silence the prompt for a missing worktree', () => {
    render(
      <DeleteWorktreeDialog
        repository={repository}
        worktreePath="/repo-feature"
        options={{ isMissing: true }}
        askForConfirmationOnWorktreeRemoval={true}
        onDeleteWorktree={async () => {}}
        onConfirmWorktreeRemovalChanged={() => {}}
        onDismissed={() => {}}
      />
    )

    assert.equal(screen.queryByText('Do not show this message again'), null)
  })

  it('offers to silence the prompt for an ordinary worktree', () => {
    render(
      <DeleteWorktreeDialog
        repository={repository}
        worktreePath="/repo-feature"
        options={{}}
        askForConfirmationOnWorktreeRemoval={true}
        onDeleteWorktree={async () => {}}
        onConfirmWorktreeRemovalChanged={() => {}}
        onDismissed={() => {}}
      />
    )

    assert.notEqual(screen.queryByText('Do not show this message again'), null)
  })
})

describe('DeleteWorktreeFailedDialog', () => {
  it('forwards the removal options unchanged when forcing', async () => {
    const { calls, onDeleteWorktree } = recordDeletes()
    const view = render(
      <DeleteWorktreeFailedDialog
        repository={repository}
        worktreePath="/repo-feature"
        options={options}
        error={new Error('nope')}
        originalWorktree={null}
        onDeleteWorktree={onDeleteWorktree}
        onSwitchToWorktree={async () => {}}
        onDismissed={() => {}}
      />
    )

    submit(view, 'Forcefully delete')

    await waitFor(() => assert.equal(calls.length, 1))
    assert.equal(calls[0].force, true)
    assert.strictEqual(calls[0].options, options)
  })
})
