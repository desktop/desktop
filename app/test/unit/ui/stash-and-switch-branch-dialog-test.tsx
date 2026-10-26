import assert from 'node:assert'
import { it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { StashAndSwitchBranch } from '../../../src/ui/stash-changes/stash-and-switch-branch-dialog'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const repository = new Repository('/repo', 1, null, false)
const currentBranch = new Branch(
  'main',
  null,
  { sha: 'abc123' },
  BranchType.Local,
  'refs/heads/main'
)
const branchToCheckout = new Branch(
  'feature',
  null,
  { sha: 'def456' },
  BranchType.Local,
  'refs/heads/feature'
)

it('disables the switch button after clicking it', async t => {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  t.after(() => {
    electron.ipcRenderer.send = previousSend
  })

  const dispatcher = {
    checkoutBranch: () => new Promise<Repository>(() => {}),
  } as unknown as Dispatcher

  render(
    <StashAndSwitchBranch
      repository={repository}
      dispatcher={dispatcher}
      currentBranch={currentBranch}
      branchToCheckout={branchToCheckout}
      hasAssociatedStash={false}
      onDismissed={() => {}}
    />
  )

  const button = screen.getByRole('button', {
    name: /Switch branch/i,
    hidden: true,
  })

  assert.equal(button.getAttribute('aria-disabled'), null)
  fireEvent.click(button)
  assert.equal(button.getAttribute('aria-disabled'), 'true')
})
