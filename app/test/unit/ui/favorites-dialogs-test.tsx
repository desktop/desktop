import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { FavoriteGroup } from '../../../src/models/favorite-group'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { ConfirmDeleteFavoriteGroupDialog } from '../../../src/ui/favorites-sidebar/confirm-delete-favorite-group-dialog'
import { FavoriteGroupNameDialog } from '../../../src/ui/favorites-sidebar/favorite-group-name-dialog'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null

class TestDispatcher {
  public addCalls = new Array<string>()
  public renameCalls = new Array<{ id: number; name: string }>()
  public removeCalls = new Array<number>()
  public assignCalls = new Array<{ repository: Repository; groupId: number }>()

  public addError: Error | null = null
  public renameError: Error | null = null
  public removeError: Error | null = null

  public async addFavoriteGroup(name: string): Promise<FavoriteGroup> {
    this.addCalls.push(name)
    if (this.addError !== null) {
      throw this.addError
    }
    return new FavoriteGroup(this.addCalls.length, name, this.addCalls.length)
  }

  public async renameFavoriteGroup(id: number, name: string): Promise<void> {
    this.renameCalls.push({ id, name })
    if (this.renameError !== null) {
      throw this.renameError
    }
  }

  public async removeFavoriteGroup(id: number): Promise<void> {
    this.removeCalls.push(id)
    if (this.removeError !== null) {
      throw this.removeError
    }
  }

  public async setRepositoryFavoriteGroup(
    repository: Repository,
    groupId: number | null
  ): Promise<void> {
    if (groupId !== null) {
      this.assignCalls.push({ repository, groupId })
    }
  }
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

async function stubIpcSend() {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
    restoreIpcSend = null
  }
}

function createRepository() {
  const owner = new Owner('octocat', 'https://api.github.com', 1)
  const gitHubRepository = new GitHubRepository(
    'desktop',
    owner,
    99,
    false,
    'https://github.com/octocat/desktop'
  )
  return new Repository('/tmp/desktop-fixture', 123, gitHubRepository, false)
}

function getOkButton(text: string) {
  return Array.from(document.querySelectorAll('button')).find(b =>
    b.textContent?.includes(text)
  )
}

afterEach(() => {
  restoreIpcSend?.()
})

describe('FavoriteGroupNameDialog', () => {
  it('creates a group with the trimmed name and assigns the repository when provided', async () => {
    const dispatcher = new TestDispatcher()
    const repository = createRepository()
    let dismissed = 0

    await stubIpcSend()

    render(
      <FavoriteGroupNameDialog
        mode="create"
        dispatcher={toDispatcher(dispatcher)}
        existingGroups={[]}
        repository={repository}
        onDismissed={() => dismissed++}
      />
    )

    const input = screen.getByLabelText('Group name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Work  ' } })

    const createButton = getOkButton('Create')
    assert.notEqual(createButton, undefined)
    assert.notEqual(createButton!.getAttribute('aria-disabled'), 'true')
    fireEvent.click(createButton!)

    await waitFor(() => {
      assert.deepEqual(dispatcher.addCalls, ['Work'])
      assert.equal(dispatcher.assignCalls.length, 1)
      assert.equal(dispatcher.assignCalls[0].repository, repository)
      assert.equal(dismissed, 1)
    })
  })

  it('disables submit and shows the duplicate error when the name collides case-insensitively', async () => {
    const dispatcher = new TestDispatcher()

    await stubIpcSend()

    render(
      <FavoriteGroupNameDialog
        mode="create"
        dispatcher={toDispatcher(dispatcher)}
        existingGroups={[new FavoriteGroup(1, 'Work', 1)]}
        onDismissed={() => {}}
      />
    )

    const input = screen.getByLabelText('Group name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'work' } })

    assert.ok(screen.getByText('already exists.', { exact: false }))
    const createButton = getOkButton('Create')
    assert.equal(createButton!.getAttribute('aria-disabled'), 'true')
    fireEvent.click(createButton!)

    assert.equal(dispatcher.addCalls.length, 0)
  })

  it('shows the at-limit error and disables submit when create mode is at the cap', async () => {
    const dispatcher = new TestDispatcher()
    const groups = [1, 2, 3, 4, 5].map(i => new FavoriteGroup(i, `G${i}`, i))

    await stubIpcSend()

    render(
      <FavoriteGroupNameDialog
        mode="create"
        dispatcher={toDispatcher(dispatcher)}
        existingGroups={groups}
        onDismissed={() => {}}
      />
    )

    const input = screen.getByLabelText('Group name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New' } })

    assert.ok(screen.getByText('which is the maximum.', { exact: false }))
    assert.equal(getOkButton('Create')!.getAttribute('aria-disabled'), 'true')
  })

  it('renames an existing group via the rename mode pre-filled with the current name', async () => {
    const dispatcher = new TestDispatcher()
    let dismissed = 0

    await stubIpcSend()

    render(
      <FavoriteGroupNameDialog
        mode="rename"
        dispatcher={toDispatcher(dispatcher)}
        existingGroups={[new FavoriteGroup(7, 'Work', 1)]}
        groupId={7}
        currentName="Work"
        onDismissed={() => dismissed++}
      />
    )

    const input = screen.getByLabelText('Group name') as HTMLInputElement
    assert.equal(input.value, 'Work')
    fireEvent.change(input, { target: { value: 'Day Job' } })

    fireEvent.click(getOkButton('Rename')!)

    await waitFor(() => {
      assert.deepEqual(dispatcher.renameCalls, [{ id: 7, name: 'Day Job' }])
      assert.equal(dismissed, 1)
    })
  })
})

describe('ConfirmDeleteFavoriteGroupDialog', () => {
  it('removes the group through the dispatcher and dismisses on confirm', async () => {
    const dispatcher = new TestDispatcher()
    let dismissed = 0

    await stubIpcSend()

    render(
      <ConfirmDeleteFavoriteGroupDialog
        dispatcher={toDispatcher(dispatcher)}
        groupId={42}
        groupName="Work"
        memberCount={3}
        onDismissed={() => dismissed++}
      />
    )

    assert.ok(
      screen.getByText('3 repositories will no longer be favorites.', {
        exact: false,
      })
    )
    fireEvent.click(getOkButton('Delete')!)

    await waitFor(() => {
      assert.deepEqual(dispatcher.removeCalls, [42])
      assert.equal(dismissed, 1)
    })
  })

  it('surfaces a dispatcher rejection as a dialog error and does not dismiss', async () => {
    const dispatcher = new TestDispatcher()
    dispatcher.removeError = new Error('boom')
    let dismissed = 0

    await stubIpcSend()

    render(
      <ConfirmDeleteFavoriteGroupDialog
        dispatcher={toDispatcher(dispatcher)}
        groupId={1}
        groupName="Personal"
        memberCount={0}
        onDismissed={() => dismissed++}
      />
    )

    fireEvent.click(getOkButton('Delete')!)

    await waitFor(() => {
      assert.deepEqual(dispatcher.removeCalls, [1])
      assert.ok(screen.getByText('boom'))
      assert.equal(dismissed, 0)
    })
  })
})
