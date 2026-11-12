import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import {
  getAccountForRepository,
  getAccountForCopilot,
  getAccountForCopilotAssistedCommits,
} from '../../src/lib/get-account-for-repository'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { createMockAPIRepository } from '../helpers/mock-api'

const endpoint = 'https://api.github.com'
const alice = new Account('alice', endpoint, 'alice-token', [], '', 1, 'Alice')
const bob = new Account('bob', endpoint, 'bob-token', [], '', 2, 'Bob')
const enterprise = new Account(
  'alice',
  'https://enterprise.example/api/v3',
  'enterprise-token',
  [],
  '',
  1,
  'Alice'
)
const github = new GitHubRepository('repo', new Owner('owner', endpoint, 1), 1)

function repository(login: string | null = null) {
  return new Repository(
    '/test/repo',
    1,
    github,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
}

describe('Repository account resolution', () => {
  it('defaults to unassigned and includes login in structural equality', async () => {
    assert.equal(repository().login, null)
    assert.notEqual(repository('alice').hash, repository('bob').hash)
  })

  it('matches both endpoint and case-insensitive login', async () => {
    assert.equal(
      getAccountForRepository([enterprise, bob, alice], repository('ALICE')),
      alice
    )
  })

  it('never falls back for an unassigned or signed-out account', async () => {
    assert.equal(getAccountForRepository([alice, bob], repository()), null)
    assert.equal(getAccountForRepository([bob], repository('alice')), null)
    assert.equal(
      getAccountForRepository([enterprise], repository('alice')),
      null
    )
  })
})

describe('Copilot account resolution', () => {
  function withCopilotAccess(
    account: Account,
    enabled: boolean | undefined,
    features?: ReadonlyArray<string>
  ) {
    return new Account(
      account.login,
      account.endpoint,
      account.token,
      account.emails,
      account.avatarURL,
      account.id,
      account.name,
      account.plan,
      account.copilotEndpoint,
      enabled,
      features
    )
  }

  it('prefers the repository-assigned Desktop-enabled account without rollout flags', () => {
    const assigned = withCopilotAccess(alice, true)
    const fallback = withCopilotAccess(bob, true)
    assert.equal(
      getAccountForCopilot(
        [fallback, withCopilotAccess(enterprise, true), assigned],
        repository('ALICE')
      ),
      assigned
    )
  })

  it('keeps the first Desktop-enabled fallback for unassigned, signed-out or disabled assignments', () => {
    const disabled = withCopilotAccess(alice, false)
    const fallback = withCopilotAccess(enterprise, true)
    const other = withCopilotAccess(bob, true)
    for (const login of [null, 'missing', 'alice']) {
      assert.equal(
        getAccountForCopilot([disabled, fallback, other], repository(login)),
        fallback
      )
    }
  })

  it('rejects accounts without explicit Desktop entitlement', () => {
    for (const accounts of [
      [],
      [withCopilotAccess(alice, false), withCopilotAccess(bob, undefined)],
    ]) {
      assert.equal(
        getAccountForCopilot(accounts, repository('alice')),
        undefined
      )
    }
  })

  it('gates only assisted account selection on its own feature flag', t => {
    const previousPreview = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    const previousChannel = __RELEASE_CHANNEL__
    delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    Object.assign(globalThis, { __RELEASE_CHANNEL__: 'production' })
    t.after(() => {
      Object.assign(globalThis, { __RELEASE_CHANNEL__: previousChannel })
      if (previousPreview === undefined) {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      } else {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreview
      }
    })
    const account = withCopilotAccess(alice, true)
    assert.equal(getAccountForCopilot([account], repository('alice')), account)
    assert.equal(
      getAccountForCopilotAssistedCommits([account], repository('alice')),
      undefined
    )
    process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
    const fallback = withCopilotAccess(bob, true)
    assert.equal(
      getAccountForCopilotAssistedCommits(
        [fallback, account],
        repository('alice')
      ),
      account
    )
    assert.equal(
      getAccountForCopilotAssistedCommits(
        [withCopilotAccess(alice, false), fallback],
        repository('alice')
      ),
      fallback
    )
    assert.equal(
      getAccountForCopilotAssistedCommits(
        [withCopilotAccess(alice, undefined)],
        repository('alice')
      ),
      undefined
    )
  })
  it('selects only entitled accounts with their own assisted rollout flag outside preview', t => {
    const previousPreview = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    t.after(() => {
      if (previousPreview === undefined) {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      } else {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreview
      }
    })
    const features = ['desktop_copilot_assisted_commits']
    const assigned = withCopilotAccess(alice, true)
    const optedIn = withCopilotAccess(bob, true, features)
    assert.equal(
      getAccountForCopilotAssistedCommits(
        [assigned, optedIn],
        repository('alice')
      ),
      optedIn
    )
    const assignedOptedIn = withCopilotAccess(alice, true, features)
    assert.equal(
      getAccountForCopilotAssistedCommits(
        [optedIn, assignedOptedIn],
        repository('ALICE')
      ),
      assignedOptedIn
    )
    for (const account of [
      assigned,
      withCopilotAccess(alice, true, ['unrelated-feature']),
      withCopilotAccess(alice, false, features),
      withCopilotAccess(alice, undefined, features),
    ]) {
      assert.equal(
        getAccountForCopilotAssistedCommits([account], repository('alice')),
        undefined
      )
    }
    assert.equal(
      getAccountForCopilot([assigned, optedIn], repository('alice')),
      assigned
    )
  })
})

describe('Repository account persistence', () => {
  async function setup() {
    const db = new TestRepositoriesDatabase()
    await db.reset()
    const store = new RepositoriesStore(db)
    const apiRepository = { ...createMockAPIRepository(), parent: undefined }
    const github = await store.upsertGitHubRepository(endpoint, apiRepository)
    return { db, store, github, apiRepository }
  }

  it('migrates legacy rows once, including unmatched repositories', async t => {
    const { db, store, github } = await setup()
    t.after(async () => {
      await setImmediate()
      db.close()
    })
    await db.repositories.bulkAdd([
      {
        path: '/legacy',
        gitHubRepositoryID: github.dbID,
        alias: null,
        missing: false,
      },
      {
        path: '/unmatched',
        gitHubRepositoryID: null,
        alias: null,
        missing: false,
      },
    ])
    await store.migrateAccountAssignments([alice])
    assert.deepEqual(
      (await store.getAll()).map(r => r.login),
      ['alice', null]
    )
    await store.migrateAccountAssignments([bob])
    assert.deepEqual(
      (await store.getAll()).map(r => r.login),
      ['alice', null]
    )
    const [legacy] = await store.getAll()
    await store.updateRepositoryAccount(legacy, null)
    await store.migrateAccountAssignments([alice])
    assert.deepEqual(
      (await store.getAll()).map(r => r.login),
      [null, null]
    )
  })

  it('migrates to an account identity whose credentials did not load', async t => {
    const { db, store, github } = await setup()
    t.after(async () => {
      await setImmediate()
      db.close()
    })
    await db.repositories.add({
      path: '/legacy',
      gitHubRepositoryID: github.dbID,
      alias: null,
      missing: false,
    })
    await store.migrateAccountAssignments([{ endpoint, login: 'alice' }])
    assert.equal((await store.getAll())[0].login, 'alice')
  })

  it('assigns an account together with its GitHub repository', async t => {
    const { db, store, apiRepository } = await setup()
    t.after(async () => {
      await setImmediate()
      db.close()
    })
    const scoped = await store.upsertGitHubRepository(
      endpoint,
      apiRepository,
      'alice'
    )
    const added = await store.addRepository('/new', undefined)
    const updated = await store.setGitHubRepository(added, scoped, 'alice')
    assert.equal(updated.login, 'alice')
    assert.equal(updated.gitHubRepository?.dbID, scoped.dbID)
    assert.deepEqual(
      (await db.gitHubRepositories.toArray()).map(r => r.accountLogin).sort(),
      ['', 'alice']
    )
  })

  it('never migrates a newly added repository', async t => {
    const { db, store, github } = await setup()
    t.after(async () => {
      await setImmediate()
      db.close()
    })
    const added = await store.addRepository('/new', undefined)
    await store.setGitHubRepository(added, github)
    await store.migrateAccountAssignments([alice])
    assert.equal((await store.getAll())[0].login, null)
  })

  it('preserves assignment through repository and worktree updates', async t => {
    const { db, store, github, apiRepository } = await setup()
    t.after(async () => {
      await setImmediate()
      db.close()
    })
    const added = await store.setGitHubRepository(
      await store.addRepository('/new', undefined),
      github
    )
    const assigned = await store.updateRepositoryAccount(added, 'alice')
    assert.equal(
      (await store.updateRepositoryMissing(assigned, true)).login,
      'alice'
    )
    assert.equal(
      (await store.updateRepositoryGitDir(assigned, '/new/.git')).login,
      'alice'
    )
    const moved = await store.updateRepositoryPath(
      assigned,
      '/moved',
      undefined,
      undefined
    )
    assert.equal(moved.login, 'alice')
    const switched = await store.switchWorktree(moved, '/worktree')
    assert.equal(switched.repository.login, 'alice')
    const refreshed = await store.setGitHubRepository(
      switched.repository,
      await store.upsertGitHubRepository(endpoint, {
        ...apiRepository,
        archived: true,
      })
    )
    assert.equal(refreshed.login, 'alice')
    assert.equal((await store.getAll())[0].login, 'alice')
  })

  it('clears only matching endpoint and login on explicit sign-out', async t => {
    const { db, store, github, apiRepository } = await setup()
    t.after(async () => {
      await setImmediate()
      db.close()
    })
    const enterpriseGithub = await store.upsertGitHubRepository(
      enterprise.endpoint,
      apiRepository
    )
    for (const [path, gh, login] of [
      ['/alice', github, 'ALICE'],
      ['/bob', github, 'bob'],
      ['/enterprise', enterpriseGithub, 'alice'],
    ] as const) {
      const added = await store.setGitHubRepository(
        await store.addRepository(path, undefined),
        gh
      )
      await store.updateRepositoryAccount(added, login)
    }
    await store.clearAccountAssignments(alice)
    assert.deepEqual(
      (await store.getAll()).map(r => r.login),
      [null, 'bob', 'alice']
    )
  })

  it('clears assignment when the endpoint changes', async t => {
    const { db, store, github, apiRepository } = await setup()
    t.after(async () => {
      await setImmediate()
      db.close()
    })
    const assigned = await store.updateRepositoryAccount(
      await store.setGitHubRepository(
        await store.addRepository('/new', undefined),
        github
      ),
      'alice'
    )
    const updated = await store.setGitHubRepository(
      assigned,
      await store.upsertGitHubRepository(enterprise.endpoint, apiRepository)
    )
    assert.equal(updated.login, null)
    assert.equal((await store.getAll())[0].login, null)
  })
})
