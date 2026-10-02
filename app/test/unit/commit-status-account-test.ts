import { describe, it } from 'node:test'
import assert from 'node:assert'
import { API } from '../../src/lib/api'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { CommitStatusStore } from '../../src/lib/stores/commit-status-store'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { TestRepositoriesDatabase } from '../helpers/databases/test-repositories-database'
import { createMockAPI } from '../helpers/mock-api'
import { getAccountForGitHubRepository } from '../../src/lib/get-account-for-repository'

describe('commit status account routing', () => {
  it('uses the associated account for workflow reruns instead of another account on the host', async t => {
    const endpoint = 'https://api.github.com'
    const first = new Account('first', endpoint, 'first-token', [], '', 1, '')
    const second = new Account(
      'second',
      endpoint,
      'second-token',
      [],
      '',
      2,
      ''
    )
    const accounts = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await accounts.addAccount(first)
    await accounts.addAccount(second)

    const db = new TestRepositoriesDatabase()
    await db.reset()
    t.after(() => db.delete())
    const repositories = new RepositoriesStore(db)
    const local = await repositories.addRepository(process.cwd(), undefined)
    await repositories.setRepositoryAccount(local, second)
    const github = new GitHubRepository(
      'project',
      new Owner('owner', endpoint, 1),
      local.id
    )
    assert.strictEqual(
      getAccountForGitHubRepository(
        await accounts.getAll(),
        await repositories.getAll(),
        github
      )?.id,
      second.id
    )
    const usedAccounts: Account[] = []
    t.mock.method(API, 'fromAccount', (account: Account) => {
      usedAccounts.push(account)
      return createMockAPI({ rerunJob: async () => true })
    })

    const statuses = new CommitStatusStore(accounts, repositories)
    assert.strictEqual(await statuses.rerunJob(github, 123), true)
    assert.deepStrictEqual(usedAccounts, [second])
  })
})
