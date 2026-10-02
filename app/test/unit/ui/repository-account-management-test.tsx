import * as React from 'react'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'
import { RepositoryAccountManagement } from '../../../src/ui/repository-account-management'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import { gitHubRepoFixture } from '../../helpers/github-repo-builder'
import { stubIPCSend } from '../../helpers/ui/electron'
import { setupEmptyRepository } from '../../helpers/repositories'
import { git } from '../../../src/lib/git/core'
import { repositoryIsOnAccountHost } from '../../../src/lib/repository-account-host'

const endpoint = 'https://api.github.com'
const account = (id: number) =>
  new Account(`person${id}`, endpoint, 'token', [], '', id, `Person ${id}`)
const repository = (id: number, accountId: number | null) =>
  new Repository(
    `repo${id}`,
    id,
    gitHubRepoFixture({ owner: 'organization', name: `repo${id}` }),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    accountId === null ? null : { endpoint, id: accountId }
  )

describe('repository account management', () => {
  it('shows current associations and only saves checked repositories', async t => {
    t.after(stubIPCSend())
    const work = account(1)
    const personal = account(2)
    const assigned: number[] = []
    render(
      <RepositoryAccountManagement
        account={personal}
        knownAccounts={[work, personal]}
        repositories={[repository(1, 1), repository(2, null)]}
        onAssign={async repo => {
          assigned.push(repo.id)
          return repo
        }}
        onDismissed={() => {}}
      />
    )

    assert.ok(screen.getByText(/organization\/repo1 - @person1/))
    assert.ok(screen.getByText(/organization\/repo2 - Unassociated/))
    fireEvent.click(screen.getByLabelText(/repo2/))
    fireEvent.click(screen.getByText('Assign repositories'))
    await waitFor(() => assert.deepStrictEqual(assigned, [2]))
  })

  it('lists a matching remote even without fetched GitHub metadata', async t => {
    t.after(stubIPCSend())
    const local = await setupEmptyRepository(t)
    await git(
      [
        'remote',
        'add',
        'origin',
        'https://github.com/organization/private.git',
      ],
      local.path,
      'addAccountManagementRemote'
    )
    render(
      <RepositoryAccountManagement
        account={account(1)}
        knownAccounts={[account(1)]}
        repositories={[local]}
        onAssign={async repository => repository}
        onDismissed={() => {}}
      />
    )
    await waitFor(() =>
      assert.ok(screen.getByText(new RegExp(`${local.name} - Unassociated`)))
    )
  })

  it('does not include a secondary GitHub remote on another primary host', async t => {
    t.after(stubIPCSend())
    const local = await setupEmptyRepository(t)
    await git(
      [
        'remote',
        'add',
        'origin',
        'https://git.example.com/organization/repo.git',
      ],
      local.path,
      'addPrimaryRemote'
    )
    await git(
      [
        'remote',
        'add',
        'secondary',
        'https://github.com/organization/repo.git',
      ],
      local.path,
      'addSecondaryRemote'
    )
    assert.strictEqual(
      await repositoryIsOnAccountHost(local, account(1)),
      false
    )
    const view = render(
      <RepositoryAccountManagement
        account={account(1)}
        knownAccounts={[account(1)]}
        repositories={[local]}
        onAssign={async repository => repository}
        onDismissed={() => {}}
      />
    )
    await waitFor(() =>
      assert.strictEqual(
        view.container.querySelectorAll('input[type=checkbox]').length,
        0
      )
    )
  })
})
