import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import {
  getDesktopManagedAuthor,
  getManagedAuthor,
  setManagedAuthorField,
  syncManagedAccounts,
  updateAuthorshipSettings,
  syncExternalAuthorship,
} from '../../src/lib/authorship'
import { getConfigValue, setConfigValue } from '../../src/lib/git/config'
import { setupEmptyRepository } from '../helpers/repositories'
import { createTempDirectory } from '../helpers/temp'
import { git } from '../../src/lib/git/core'

const identity = { endpoint: 'https://api.github.com', id: 42 }
const account = (name: string, id = identity.id) =>
  new Account('person', identity.endpoint, 'token', [], '', id, name)

const associated = (repository: Repository, accountIdentity = identity) =>
  new Repository(
    repository.path,
    repository.id,
    null,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    accountIdentity
  )

describe('managed commit authorship', () => {
  afterEach(() => localStorage.removeItem('desktop-authorship-settings'))

  it('keeps API-derived fields in sync but preserves an edited field', () => {
    syncManagedAccounts([account('Original')])
    assert.deepStrictEqual(getManagedAuthor(identity), {
      name: 'Original',
      email: '42+person@users.noreply.github.com',
    })

    setManagedAuthorField(identity, 'email', 'chosen@example.com')
    syncManagedAccounts([account('Updated')])
    assert.deepStrictEqual(getManagedAuthor(identity), {
      name: 'Updated',
      email: 'chosen@example.com',
    })
  })

  it('uses an associated identity after sign-out and not for unassociated repositories', async t => {
    const repository = await setupEmptyRepository(t)
    syncManagedAccounts([account('Person')])
    await updateAuthorshipSettings(true, false, [associated(repository)])

    assert.strictEqual(
      getDesktopManagedAuthor(associated(repository))?.name,
      'Person'
    )
    assert.strictEqual(getDesktopManagedAuthor(repository), null)
    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      null
    )
  })

  it('restores the previous local Git identity and refuses to erase external edits', async t => {
    const repository = associated(await setupEmptyRepository(t))
    await setConfigValue(repository, 'user.name', 'Previous')
    syncManagedAccounts([account('Managed')])
    await updateAuthorshipSettings(true, true, [repository])

    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      'Managed'
    )
    setManagedAuthorField(identity, 'name', 'Updated')
    await syncExternalAuthorship([repository])
    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      'Updated'
    )

    await setConfigValue(repository, 'user.name', 'External edit')
    await assert.rejects(
      updateAuthorshipSettings(false, false, [repository]),
      /changed outside Desktop/
    )
    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      'External edit'
    )
    await setConfigValue(repository, 'user.name', 'Updated')
    await updateAuthorshipSettings(false, false, [repository])
    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      'Previous'
    )
    assert.strictEqual(
      await getConfigValue(repository, 'user.email', true),
      null
    )
  })

  it('refuses to modify shared Git config for linked worktrees', async t => {
    const repository = associated(await setupEmptyRepository(t))
    const worktreePath = await createTempDirectory(t)
    await git(
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '--allow-empty',
        '-m',
        'initial',
      ],
      repository.path,
      'initialWorktreeCommit'
    )
    await git(
      ['worktree', 'add', '-b', 'linked', worktreePath],
      repository.path,
      'addLinkedWorktree'
    )
    syncManagedAccounts([account('Managed')])
    await assert.rejects(
      updateAuthorshipSettings(true, true, [repository]),
      /linked worktrees share local Git configuration/
    )
    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      null
    )
    assert.strictEqual(
      await getConfigValue(repository, 'user.email', true),
      null
    )
  })

  it('updates external Git identity on reassignment and restores the original values', async t => {
    const repository = await setupEmptyRepository(t)
    const otherIdentity = { ...identity, id: 43 }
    syncManagedAccounts([account('First'), account('Second', 43)])
    await updateAuthorshipSettings(true, true, [associated(repository)])
    await syncExternalAuthorship([associated(repository, otherIdentity)])
    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      'Second'
    )
    await updateAuthorshipSettings(false, false, [
      associated(repository, otherIdentity),
    ])
    assert.strictEqual(
      await getConfigValue(repository, 'user.name', true),
      null
    )
  })
})
