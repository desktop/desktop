import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import { Publish } from '../../../src/ui/publish-repository/publish'
import { PublishRepository } from '../../../src/ui/publish-repository/publish-repository'
import { RepositoriesStore } from '../../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../../helpers/databases'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

describe('Publish Repository account choice', () => {
  const first = new Account(
    'joan',
    getDotComAPIEndpoint(),
    'one',
    [],
    '',
    1,
    'Joan'
  )
  const second = new Account(
    'alex',
    'https://enterprise.example.com/api/v3',
    'two',
    [],
    '',
    2,
    'Alex'
  )
  const originalDidMount = Publish.prototype.componentDidMount
  const originalWillMount = PublishRepository.prototype.componentWillMount
  let restoreIpcSend: (() => void) | undefined

  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
    Publish.prototype.componentDidMount = async () => {}
    PublishRepository.prototype.componentWillMount = async () => {}
  })

  afterEach(() => {
    restoreIpcSend?.()
    Publish.prototype.componentDidMount = originalDidMount
    PublishRepository.prototype.componentWillMount = originalWillMount
  })

  it('selects the repository association without separate host tabs', () => {
    const repository = new Repository(
      '/project',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      { endpoint: second.endpoint, id: second.id }
    )
    render(
      <Publish
        dispatcher={{} as Dispatcher}
        repository={repository}
        accounts={[first, second]}
        onDismissed={() => {}}
      />
    )

    assert.ok(screen.getByText('@alex'))
    assert.strictEqual(screen.queryByRole('tablist', { hidden: true }), null)
  })

  it('requires an explicit account choice for an unassociated repository', () => {
    render(
      <Publish
        dispatcher={{} as Dispatcher}
        repository={new Repository('/project', 1, null, false)}
        accounts={[first, second]}
        onDismissed={() => {}}
      />
    )

    assert.ok(screen.getByText('Choose an account to publish'))
    assert.strictEqual(screen.queryByRole('tablist', { hidden: true }), null)
  })

  it('associates the selected account after a successful publish', async () => {
    const database = new TestRepositoriesDatabase()
    await database.reset()
    const store = new RepositoriesStore(database)
    const repository = await store.addRepository('/project', '/project/.git')
    const dispatcher = {
      publishRepository: async () => repository,
      setRepositoryAccount: (repo: Repository, account: Account) =>
        store.setRepositoryAccount(repo, account),
    } as unknown as Dispatcher

    try {
      const view = render(
        <Publish
          dispatcher={dispatcher}
          repository={repository}
          accounts={[first]}
          onDismissed={() => {}}
        />
      )
      const form = view.container.querySelector('form')
      assert.ok(form)
      fireEvent.submit(form)

      await waitFor(async () => {
        const [saved] = await store.getAll()
        assert.deepStrictEqual(saved.accountIdentity, {
          endpoint: first.endpoint,
          id: first.id,
        })
      })
    } finally {
      database.close()
    }
  })
})
