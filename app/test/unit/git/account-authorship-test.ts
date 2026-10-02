import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import {
  getAuthorForRepository,
  getCommitAuthorIdentityForRepository,
  getManagedAuthor,
  getAuthoringMode,
  getManageExternalAppAuthors,
  setAuthoringMode,
  setManageExternalAppAuthors,
  setManagedAuthor,
  saveManagedAuthorEdits,
  synchronizeExternalAppAuthor,
} from '../../../src/lib/git/account-authorship'
import { getConfigValue, setConfigValue } from '../../../src/lib/git/config'
import { setupEmptyRepository } from '../../helpers/repositories'
import { getAuthorIdentity } from '../../../src/lib/git/var'
import { CommitIdentity } from '../../../src/models/commit-identity'

const endpoint = 'https://api.github.com'
const alice = new Account(
  'alice',
  endpoint,
  'token',
  [
    {
      email: 'alice@example.com',
      primary: true,
      verified: true,
      visibility: 'public',
    },
  ],
  '',
  101,
  'Alice Smith'
)
const bob = new Account(
  'bob',
  endpoint,
  'token',
  [
    {
      email: 'bob@example.com',
      primary: true,
      verified: true,
      visibility: 'public',
    },
  ],
  '',
  102,
  ''
)

describe('account-aware authorship', () => {
  afterEach(() => localStorage.clear())

  it('preserves Git-managed authorship when no source preference was saved', () => {
    localStorage.removeItem('desktop-authoring-mode')
    assert.strictEqual(localStorage.getItem('desktop-authoring-mode'), null)
    assert.strictEqual(getAuthoringMode(), 'git')
    assert.strictEqual(getManageExternalAppAuthors(), false)
  })

  it('uses Desktop-managed account identity when explicitly selected', () => {
    setAuthoringMode('desktop')
    assert.strictEqual(getAuthoringMode(), 'desktop')
    assert.deepStrictEqual(getManagedAuthor(alice), {
      name: 'Alice Smith',
      email: 'alice@example.com',
    })
    assert.deepStrictEqual(getManagedAuthor(bob), {
      name: 'bob',
      email: 'bob@example.com',
    })
    assert.strictEqual(getManageExternalAppAuthors(), false)
  })

  it('reports invalid stored author data before falling back to the account', t => {
    localStorage.setItem(`desktop-author:${endpoint}:101`, '{invalid JSON')
    const reported: Array<{ message: string; error: unknown }> = []
    t.mock.method(log, 'error', (message: string, error: unknown) => {
      reported.push({ message, error })
    })

    assert.deepStrictEqual(getManagedAuthor(alice), {
      name: 'Alice Smith',
      email: 'alice@example.com',
    })
    assert.strictEqual(reported.length, 1)
    assert.match(reported[0].message, /stored.*author/i)
    assert.ok(reported[0].error instanceof SyntaxError)
  })

  it('preserves explicit field overrides while refreshing other fields from the account', () => {
    setAuthoringMode('desktop')
    getManagedAuthor(alice)
    setManagedAuthor(alice, {
      name: 'Commit Alias',
      email: 'alice@example.com',
    })

    const updated = new Account(
      'alice',
      endpoint,
      'new-token',
      [
        {
          email: 'updated@example.com',
          primary: true,
          verified: true,
          visibility: 'public',
        },
      ],
      '',
      101,
      'Alice Updated'
    )
    assert.deepStrictEqual(getManagedAuthor(updated), {
      name: 'Commit Alias',
      email: 'updated@example.com',
    })
    setManagedAuthor(updated, {
      name: 'Commit Alias',
      email: 'custom@example.com',
    })
    assert.deepStrictEqual(getManagedAuthor(alice), {
      name: 'Commit Alias',
      email: 'custom@example.com',
    })
  })

  it('does not freeze an unedited email when account data changes before Save', () => {
    setAuthoringMode('desktop')
    const original = getManagedAuthor(alice)
    const updated = new Account(
      'alice',
      endpoint,
      'new-token',
      [
        {
          email: 'new@example.com',
          primary: true,
          verified: true,
          visibility: 'public',
        },
      ],
      '',
      101,
      'Alice Updated'
    )
    saveManagedAuthorEdits(updated, original, {
      ...original,
      name: 'Commit Alias',
    })
    assert.deepStrictEqual(getManagedAuthor(updated), {
      name: 'Commit Alias',
      email: 'new@example.com',
    })
  })

  it('uses the associated identity, retains it after sign-out and follows reassignment', async t => {
    setAuthoringMode('desktop')
    const repo = await setupEmptyRepository(t)
    setManagedAuthor(alice, { name: 'A', email: 'a@example.com' })
    setManagedAuthor(bob, { name: 'B', email: 'b@example.com' })
    const assigned = (id: number | null) =>
      Object.assign(repo, {
        accountIdentity: id === null ? null : { endpoint, id },
      }) as Repository

    assert.deepStrictEqual(
      await getAuthorForRepository(assigned(101), [alice, bob]),
      { name: 'A', email: 'a@example.com' }
    )
    assert.deepStrictEqual(await getAuthorForRepository(assigned(101), []), {
      name: 'A',
      email: 'a@example.com',
    })

    assert.deepStrictEqual(await getAuthorForRepository(assigned(102), [bob]), {
      name: 'B',
      email: 'b@example.com',
    })
    assert.strictEqual(
      (await getAuthorForRepository(assigned(null), [alice, bob]))?.email,
      (await getAuthorForRepository(assigned(null), []))?.email
    )
  })

  it('provides a CommitIdentity for the existing AppStore author contract', async t => {
    setAuthoringMode('desktop')
    const repo = await setupEmptyRepository(t)
    const assigned = Object.assign(repo, {
      accountIdentity: { endpoint, id: 101 },
    }) as Repository
    const author = await getCommitAuthorIdentityForRepository(assigned, [alice])
    assert.ok(author instanceof CommitIdentity)
    assert.strictEqual(author.name, 'Alice Smith')
    assert.strictEqual(author.email, 'alice@example.com')
  })

  it('uses effective Git identity in Git mode even for an associated repository', async t => {
    const repo = await setupEmptyRepository(t)
    await setConfigValue(repo, 'user.name', 'Local Author')
    await setConfigValue(repo, 'user.email', 'local@example.com')
    setAuthoringMode('git')
    const assigned = Object.assign(repo, {
      accountIdentity: { endpoint, id: 101 },
    }) as Repository
    const gitAuthor = await getAuthorIdentity(repo)
    assert.deepStrictEqual(await getAuthorForRepository(assigned, [alice]), {
      name: gitAuthor?.name,
      email: gitAuthor?.email,
    })
  })

  it('only changes local Git identity on opt-in and restores original values on opt-out', async t => {
    setAuthoringMode('desktop')
    const repo = await setupEmptyRepository(t)
    await setConfigValue(repo, 'user.name', 'Before')
    setManagedAuthor(alice, { name: 'Managed', email: 'managed@example.com' })
    const assigned = Object.assign(repo, {
      accountIdentity: { endpoint, id: 101 },
    }) as Repository
    await synchronizeExternalAppAuthor(assigned, [alice])
    assert.strictEqual(await getConfigValue(repo, 'user.name', true), 'Before')
    setManageExternalAppAuthors(true)
    await synchronizeExternalAppAuthor(assigned, [alice])
    assert.strictEqual(await getConfigValue(repo, 'user.name', true), 'Managed')
    assert.strictEqual(
      await getConfigValue(repo, 'user.email', true),
      'managed@example.com'
    )
    setManageExternalAppAuthors(false)
    await synchronizeExternalAppAuthor(assigned, [alice])
    assert.strictEqual(await getConfigValue(repo, 'user.name', true), 'Before')
    assert.strictEqual(await getConfigValue(repo, 'user.email', true), null)
  })
})
