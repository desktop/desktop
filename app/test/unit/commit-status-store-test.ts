import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import {
  API,
  APICheckConclusion,
  APICheckStatus,
  IAPIRefStatus,
} from '../../src/lib/api'
import { ICombinedRefCheck } from '../../src/lib/ci-checks/ci-checks'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { Repository } from '../../src/models/repository'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { createMockAPI } from '../helpers/mock-api'
import { CommitStatusStore } from '../../src/lib/stores/commit-status-store'

const endpoint = 'https://api.github.com'
const firstAccount = new Account(
  'first',
  endpoint,
  'first-token',
  [],
  '',
  1,
  ''
)
const secondAccount = new Account(
  'second',
  endpoint,
  'second-token',
  [],
  '',
  2,
  ''
)
const githubRepository = new GitHubRepository(
  'desktop',
  new Owner('desktop', endpoint, 1),
  1
)
const ref = 'refs/pull/1/head'

function localRepository(login: string | null, id = 1) {
  return new Repository(
    'desktop',
    id,
    githubRepository,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
}

function statusFor(account: Account): IAPIRefStatus {
  return {
    state: 'success',
    total_count: 1,
    statuses: [
      {
        id: account.id,
        context: account.login,
        description: '',
        target_url: null,
        state: 'success',
      },
    ],
  }
}

async function flushRefreshes() {
  await new Promise<void>(resolve => setImmediate(resolve))
  await new Promise<void>(resolve => setImmediate(resolve))
}

async function createStore() {
  const accountsStore = new AccountsStore(
    new InMemoryStore(),
    new AsyncInMemoryStore()
  )
  await accountsStore.addAccount(firstAccount)
  await accountsStore.addAccount(secondAccount)
  const store = new CommitStatusStore(accountsStore)
  await flushRefreshes()
  return { store, accountsStore }
}

function subscribe(
  t: TestContext,
  store: CommitStatusStore,
  repository: Repository,
  branchName?: string
) {
  return new Promise<ICombinedRefCheck>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for commit status')),
      5000
    )
    t.after(() => clearTimeout(timeout))
    const subscription = store.subscribe(
      githubRepository,
      repository,
      ref,
      check => {
        if (check !== null) {
          clearTimeout(timeout)
          resolve(check)
        }
      },
      branchName
    )
    t.after(() => subscription.dispose())
  })
}

describe('CommitStatusStore account assignment', () => {
  it('isolates subscriptions and cached statuses for accounts on the same endpoint', async t => {
    const { store } = await createStore()
    const tokens: string[] = []
    t.mock.method(API, 'fromAccount', (account: Account) => {
      tokens.push(account.token)
      return createMockAPI({
        fetchCombinedRefStatus: async () => statusFor(account),
        fetchRefCheckRuns: async () => ({ total_count: 0, check_runs: [] }),
      })
    })
    const first = localRepository(firstAccount.login)
    const second = localRepository(secondAccount.login)
    const firstStatus = await subscribe(t, store, first)
    assert.strictEqual(store.tryGetStatus(githubRepository, second, ref), null)
    const secondStatus = await subscribe(t, store, second)

    assert.deepStrictEqual(tokens, ['first-token', 'second-token'])
    assert.strictEqual(firstStatus.checks[0].name, 'first')
    assert.strictEqual(secondStatus.checks[0].name, 'second')
    assert.strictEqual(
      store.tryGetStatus(githubRepository, first, ref),
      firstStatus
    )
    assert.strictEqual(
      store.tryGetStatus(githubRepository, second, ref),
      secondStatus
    )
    await store.manualRefreshSubscription(
      githubRepository,
      second,
      ref,
      secondStatus.checks
    )
    assert.strictEqual(
      store.tryGetStatus(githubRepository, first, ref),
      firstStatus
    )
    assert.strictEqual(
      store.tryGetStatus(githubRepository, second, ref)?.checks[0].conclusion,
      null
    )
  })

  for (const login of [null, 'missing']) {
    it(`does not fall back to another account when assignment is ${login}`, async t => {
      const { store } = await createStore()
      const api = t.mock.method(API, 'fromAccount', () => {
        throw new Error('Must not make an API request')
      })
      const repository = localRepository(login)
      const subscription = store.subscribe(
        githubRepository,
        repository,
        ref,
        () => {}
      )
      t.after(() => subscription.dispose())
      await flushRefreshes()

      assert.strictEqual(
        await store.fetchCheckSuite(githubRepository, repository, 1),
        null
      )
      assert.strictEqual(
        await store.rerequestCheckSuite(githubRepository, repository, 1),
        false
      )
      assert.strictEqual(
        await store.rerunJob(githubRepository, repository, 1),
        false
      )
      assert.strictEqual(
        await store.rerunFailedJobs(githubRepository, repository, 1),
        false
      )
      assert.strictEqual(
        store.tryGetStatus(githubRepository, repository, ref),
        null
      )
      assert.strictEqual(api.mock.callCount(), 0)
    })
  }

  it('uses the assigned token for check suites and all rerun methods', async t => {
    const { store } = await createStore()
    const tokens: string[] = []
    const suite = {
      id: 1,
      rerequestable: true,
      runs_rerequestable: true,
      status: APICheckStatus.Completed,
      created_at: new Date().toISOString(),
    }
    t.mock.method(API, 'fromAccount', (account: Account) => {
      tokens.push(account.token)
      return createMockAPI({
        fetchCheckSuite: async () => suite,
        rerequestCheckSuite: async () => true,
        rerunJob: async () => true,
        rerunFailedJobs: async () => true,
      })
    })
    const repository = localRepository(secondAccount.login)
    assert.strictEqual(
      await store.fetchCheckSuite(githubRepository, repository, 1),
      suite
    )
    assert.strictEqual(
      await store.rerequestCheckSuite(githubRepository, repository, 1),
      true
    )
    assert.strictEqual(
      await store.rerunJob(githubRepository, repository, 1),
      true
    )
    assert.strictEqual(
      await store.rerunFailedJobs(githubRepository, repository, 1),
      true
    )
    assert.deepStrictEqual(tokens, Array(4).fill('second-token'))
  })

  it('keeps the PR base as the request target without using its owner as the account', async t => {
    const { store } = await createStore()
    const requests: ReadonlyArray<string | number>[] = []
    t.mock.method(API, 'fromAccount', (account: Account) => {
      assert.strictEqual(account.token, 'second-token')
      return createMockAPI({
        fetchCheckSuite: async (owner, name, id) => {
          requests.push([owner, name, id])
          return null
        },
      })
    })
    const upstream = new GitHubRepository(
      'upstream',
      new Owner('another-owner', endpoint, 10),
      2
    )

    await store.fetchCheckSuite(
      upstream,
      localRepository(secondAccount.login),
      99
    )

    assert.deepStrictEqual(requests, [['another-owner', 'upstream', 99]])
  })

  it('does not use the assigned token against a different endpoint', async t => {
    const { store } = await createStore()
    const api = t.mock.method(API, 'fromAccount', () => {
      throw new Error('Must not make an API request')
    })
    const otherRepository = new GitHubRepository(
      'desktop',
      new Owner('desktop', 'https://enterprise.example/api/v3', 1),
      2
    )
    const repository = localRepository(secondAccount.login)
    const subscription = store.subscribe(
      otherRepository,
      repository,
      ref,
      () => {}
    )
    t.after(() => subscription.dispose())
    await flushRefreshes()

    assert.strictEqual(
      await store.fetchCheckSuite(otherRepository, repository, 1),
      null
    )
    assert.strictEqual(
      await store.rerunJob(otherRepository, repository, 1),
      false
    )
    assert.strictEqual(api.mock.callCount(), 0)
  })

  it('uses the assigned token when fetching Actions workflows and jobs', async t => {
    const { store } = await createStore()
    const tokens: string[] = []
    t.mock.method(API, 'fromAccount', (account: Account) => {
      tokens.push(account.token)
      return createMockAPI({
        fetchCombinedRefStatus: async () => null,
        fetchRefCheckRuns: async () => ({
          total_count: 1,
          check_runs: [
            {
              id: 10,
              url: '',
              status: APICheckStatus.Completed,
              conclusion: APICheckConclusion.Success,
              name: 'Build',
              check_suite: { id: 20 },
              app: { name: 'GitHub Actions' },
              completed_at: '',
              started_at: '',
              html_url: '',
              pull_requests: [],
            },
          ],
        }),
        fetchPRActionWorkflowRunByCheckSuiteId: async () => ({
          id: 30,
          workflow_id: 40,
          cancel_url: '',
          created_at: '',
          logs_url: '',
          name: 'Build',
          rerun_url: '',
          check_suite_id: 20,
          event: 'pull_request',
        }),
        fetchWorkflowRunJobs: async () => ({ total_count: 0, jobs: [] }),
      })
    })

    const check = await subscribe(
      t,
      store,
      localRepository(secondAccount.login),
      'feature'
    )
    assert.strictEqual(check.checks[0].actionsWorkflow?.id, 30)
    assert.deepStrictEqual(tokens, Array(3).fill('second-token'))
  })

  it('clears cached status when the assigned account is removed', async t => {
    const { store, accountsStore } = await createStore()
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchCombinedRefStatus: async () => statusFor(account),
        fetchRefCheckRuns: async () => ({ total_count: 0, check_runs: [] }),
      })
    )
    const repository = localRepository(secondAccount.login)
    await subscribe(t, store, repository)
    const updates: (ICombinedRefCheck | null)[] = []
    const subscription = store.subscribe(
      githubRepository,
      repository,
      ref,
      check => updates.push(check)
    )
    t.after(() => subscription.dispose())

    await accountsStore.removeAccount(secondAccount)
    await flushRefreshes()
    assert.strictEqual(
      store.tryGetStatus(githubRepository, repository, ref),
      null
    )
    assert.deepStrictEqual(updates, [null])
  })

  it('ignores an in-flight result after the old assignment subscription is disposed', async t => {
    const { store } = await createStore()
    let finish: (status: IAPIRefStatus) => void = () => {
      throw new Error('Request has not started')
    }
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchCombinedRefStatus: () =>
          account === firstAccount
            ? new Promise<IAPIRefStatus>(resolve => {
                finish = resolve
              })
            : Promise.resolve(statusFor(account)),
        fetchRefCheckRuns: async () => ({ total_count: 0, check_runs: [] }),
      })
    )
    const first = localRepository(firstAccount.login)
    const oldUpdates: (ICombinedRefCheck | null)[] = []
    const oldSubscription = store.subscribe(
      githubRepository,
      first,
      ref,
      check => oldUpdates.push(check)
    )
    await flushRefreshes()
    oldSubscription.dispose()
    const second = localRepository(secondAccount.login)
    const check = await subscribe(t, store, second)
    finish(statusFor(firstAccount))
    await flushRefreshes()

    assert.deepStrictEqual(oldUpdates, [])
    assert.strictEqual(store.tryGetStatus(githubRepository, first, ref), null)
    assert.strictEqual(store.tryGetStatus(githubRepository, second, ref), check)
  })
})
