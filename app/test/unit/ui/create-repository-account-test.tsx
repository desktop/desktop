import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import { CreateRepository } from '../../../src/ui/add-repository/create-repository'
import { RepositoryPath } from '../../../src/ui/lib/repository-path'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Create Repository account selection', () => {
  let restoreIpcSend: (() => void) | undefined
  const originalDidMount = CreateRepository.prototype.componentDidMount
  const originalPathDidMount = RepositoryPath.prototype.componentDidMount

  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
    CreateRepository.prototype.componentDidMount = async () => {}
    RepositoryPath.prototype.componentDidMount = async () => {}
  })

  afterEach(() => {
    restoreIpcSend?.()
    CreateRepository.prototype.componentDidMount = originalDidMount
    RepositoryPath.prototype.componentDidMount = originalPathDidMount
  })

  const account = new Account(
    'joan',
    getDotComAPIEndpoint(),
    'token',
    [],
    '',
    1,
    'Joan'
  )

  it('defaults to No account and does not ask for a commit identity', () => {
    render(
      <CreateRepository
        dispatcher={{} as Dispatcher}
        accounts={[account]}
        onDismissed={() => {}}
        isTopMost={false}
        initialPath="/tmp/new-repository"
      />
    )

    const picker = screen.getByLabelText('Account')
    assert.strictEqual(
      (picker as HTMLSelectElement).selectedOptions[0].text,
      'No account'
    )
    assert.strictEqual(screen.queryByLabelText('Commit name'), null)
    assert.strictEqual(screen.queryByLabelText('Commit email'), null)
  })

  it('offers signed-in accounts for optional association', () => {
    render(
      <CreateRepository
        dispatcher={{} as Dispatcher}
        accounts={[account]}
        onDismissed={() => {}}
        isTopMost={false}
        initialPath="/tmp/new-repository"
      />
    )

    const picker = screen.getByLabelText('Account')
    fireEvent.change(picker, {
      target: { value: `${account.endpoint}:${account.id}` },
    })
    assert.strictEqual(
      (picker as HTMLSelectElement).selectedOptions[0].text,
      '@joan (GitHub.com)'
    )
  })
})
