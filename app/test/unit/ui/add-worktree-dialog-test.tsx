import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { join } from 'path'
import { AddWorktreeDialog } from '../../../src/ui/worktrees/add-worktree-dialog'
import { RepositoryPath } from '../../../src/ui/lib/repository-path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { seed } from '../../helpers/assisted-commit'
import { deferred } from '../../helpers/copilot-assisted-commit'
import { render, screen, waitFor } from '../../helpers/ui/render'

describe('add worktree dialog settlement', () => {
  it('clears creating before successful dismissal actually unmounts the dialog', async t => {
    const repository = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    RepositoryPath.setDefaultPath(repository.path)
    const finish = deferred<void>()
    t.after(() => finish.resolve())
    const create = t.mock.method(
      h.appStore,
      '_addWorktreeAndSwitch',
      () => finish.promise
    )
    const ref = React.createRef<AddWorktreeDialog>()
    let creatingAtDismiss: boolean | undefined
    let updatesAtUnmount = -1
    const view = render(
      <AddWorktreeDialog
        ref={ref}
        repository={repository}
        dispatcher={h.dispatcher}
        initialWorktreeName="new-worktree"
        allBranches={[]}
        onDismissed={() => {
          const current = ref.current
          assert.ok(current)
          creatingAtDismiss = current.state.creating
          view.unmount()
          updatesAtUnmount = updates.mock.callCount()
        }}
      />
    )
    await waitFor(() =>
      assert.equal(
        ref.current?.state.fullPath,
        join(repository.path, 'new-worktree')
      )
    )
    const component = ref.current
    assert.ok(component)
    const updates = t.mock.method(component, 'setState')
    const creating = component['onSubmit']()
    await waitFor(() => assert.equal(create.mock.callCount(), 1))
    assert.equal(component.state.creating, true)
    assert.equal(
      screen
        .getByRole('button', { name: /Create worktree/i, hidden: true })
        .getAttribute('aria-disabled'),
      'true'
    )
    assert.equal(creatingAtDismiss, undefined)
    finish.resolve()
    await creating
    assert.equal(
      ref.current,
      null,
      'Successful dismissal must actually unmount'
    )
    assert.equal(creatingAtDismiss, false)
    assert.equal(
      updates.mock.callCount(),
      updatesAtUnmount,
      'No state update may follow actual unmount'
    )
  })

  it('keeps failures open, reports the error and re-enables creation', async t => {
    const repository = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    RepositoryPath.setDefaultPath(repository.path)
    const finish = deferred<void>()
    t.after(() => finish.resolve())
    const failure = new Error('Worktree creation failed')
    t.mock.method(h.appStore, '_addWorktreeAndSwitch', async () => {
      await finish.promise
      throw failure
    })
    const postError = t.mock.method(h.dispatcher, 'postError', () => {})
    const dismissed = t.mock.fn()
    const ref = React.createRef<AddWorktreeDialog>()
    render(
      <AddWorktreeDialog
        ref={ref}
        repository={repository}
        dispatcher={h.dispatcher}
        initialWorktreeName="failed-worktree"
        allBranches={[]}
        onDismissed={dismissed}
      />
    )
    await waitFor(() => assert.ok(ref.current?.state.fullPath))
    const component = ref.current
    assert.ok(component)
    const creating = component['onSubmit']()
    const button = screen.getByRole('button', {
      name: /Create worktree/i,
      hidden: true,
    })
    assert.equal(button.getAttribute('aria-disabled'), 'true')
    finish.resolve()
    await creating
    assert.equal(dismissed.mock.callCount(), 0)
    assert.equal(postError.mock.callCount(), 1)
    assert.strictEqual(postError.mock.calls[0].arguments[0], failure)
    assert.strictEqual(ref.current, component)
    assert.equal(component.state.creating, false)
    assert.notEqual(button.getAttribute('aria-disabled'), 'true')
  })
})
