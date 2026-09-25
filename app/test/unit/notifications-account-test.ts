import assert from 'node:assert'
import { before, describe, it, mock, TestContext } from 'node:test'
import { Disposable } from 'event-kit'
import {
  API,
  IAPIComment,
  IAPIPullRequestReview,
  APICheckConclusion,
  APICheckStatus,
} from '../../src/lib/api'
import type { AccountsStore } from '../../src/lib/stores/accounts-store'
import type {
  AliveStore,
  DesktopAliveEvent,
} from '../../src/lib/stores/alive-store'
import type { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import type { PullRequestCoordinator } from '../../src/lib/stores/pull-request-coordinator'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import {
  Repository,
  assertIsRepositoryWithGitHubRepository,
} from '../../src/models/repository'
import { ForkContributionTarget } from '../../src/models/workflow-preferences'
import {
  createMockAPI,
  createMockAPIIdentity,
  createMockAPIEmail,
} from '../helpers/mock-api'
import type { StatsStore } from '../../src/lib/stats'

const endpoint = 'https://api.github.com'
const first = new Account('first', endpoint, 'first-token', [], '', 1, '')
const second = new Account(
  'second',
  endpoint,
  'second-token',
  [createMockAPIEmail('second@example.com')],
  '',
  2,
  ''
)
const github = new GitHubRepository('repo', new Owner('owner', endpoint, 1), 1)
const head = new PullRequestRef('branch', 'abc123', github)
const pullRequest = new PullRequest(
  new Date(),
  'PR',
  1,
  head,
  head,
  'second',
  false,
  ''
)
const showNotification = mock.fn()
const getCommit = mock.fn(async () => {
  const { Commit } = await import('../../src/models/commit')
  const { CommitIdentity } = await import('../../src/models/commit-identity')
  const identity = new CommitIdentity(
    'second',
    'second@example.com',
    new Date()
  )
  return new Commit('abc123', 'abc123', '', '', identity, identity, [], [], [])
})

before(() => {
  mock.module('../../src/lib/git/index.ts', {
    namedExports: { getCommit },
  })
  mock.module('../../src/ui/dispatcher/index.ts', {
    namedExports: { defaultErrorHandler: mock.fn() },
  })
  mock.module('../../src/lib/notifications/show-notification.ts', {
    namedExports: { showNotification },
  })
})

function local(login: string | null, remote = github, id = 1) {
  const repository = new Repository(
    `/repo-${id}`,
    id,
    remote,
    false,
    null,
    { forkContributionTarget: ForkContributionTarget.Parent },
    false,
    undefined,
    undefined,
    login
  )
  assertIsRepositoryWithGitHubRepository(repository)
  return repository
}

function comment(account: Account): IAPIComment {
  return {
    id: account.id,
    body: account.login,
    html_url: '',
    user: createMockAPIIdentity({ login: account.login }),
    created_at: new Date().toISOString(),
  }
}

function review(account: Account): IAPIPullRequestReview {
  return {
    ...comment(account),
    submitted_at: new Date().toISOString(),
    state: 'APPROVED',
  }
}

async function createStores(t: TestContext) {
  const { NotificationsStore } = await import(
    '../../src/lib/stores/notifications-store'
  )
  const { NotificationsDebugStore } = await import(
    '../../src/lib/stores/notifications-debug-store'
  )
  let signedIn = [first, second]
  const accounts: Pick<AccountsStore, 'getAll' | 'removeAccount'> = {
    getAll: async () => signedIn,
    removeAccount: async account => {
      signedIn = signedIn.filter(a => a !== account)
    },
  }
  let eventHandler: ((event: DesktopAliveEvent) => void) | undefined
  let repositoriesChanged:
    | ((repositories: ReadonlyArray<Repository>) => void)
    | undefined
  const alive: Pick<AliveStore, 'setEnabled' | 'onAliveEventReceived'> = {
    setEnabled: () => {},
    onAliveEventReceived: callback => {
      eventHandler = callback
    },
  }
  const repositories: Pick<RepositoriesStore, 'onDidUpdate'> = {
    onDidUpdate: callback => {
      repositoriesChanged = callback
      return new Disposable()
    },
  }
  const coordinator: Pick<PullRequestCoordinator, 'getAllPullRequests'> = {
    getAllPullRequests: async () => [pullRequest],
  }
  const stats: Pick<
    StatsStore,
    'increment' | 'recordPullRequestReviewNotificationShown'
  > = {
    increment: async () => {},
    recordPullRequestReviewNotificationShown: async () => {},
  }
  const store = new NotificationsStore(
    accounts as AccountsStore,
    alive as AliveStore,
    coordinator as PullRequestCoordinator,
    stats as StatsStore,
    repositories as RepositoriesStore
  )
  const debug = new NotificationsDebugStore(
    accounts as AccountsStore,
    store,
    coordinator as PullRequestCoordinator
  )
  const requests: Array<readonly [string, string, string, string]> = []
  const record = (
    account: Account,
    method: string,
    owner: string,
    repo: string
  ) => requests.push([account.login, method, owner, repo])
  t.mock.method(API, 'fromAccount', (account: Account) =>
    createMockAPI({
      fetchIssueComment: async (owner, repo) => {
        record(account, 'comment', owner, repo)
        return comment(account)
      },
      fetchPullRequestReviewComment: async (owner, repo) => {
        record(account, 'review-comment', owner, repo)
        return comment(account)
      },
      fetchPullRequestReview: async (owner, repo) => {
        record(account, 'review', owner, repo)
        return review(account)
      },
      fetchIssueComments: async (owner, repo) => {
        record(account, 'comments', owner, repo)
        return [comment(account)]
      },
      fetchPullRequestComments: async (owner, repo) => {
        record(account, 'review-comments', owner, repo)
        return []
      },
      fetchPullRequestReviews: async (owner, repo) => {
        record(account, 'reviews', owner, repo)
        return [review(account)]
      },
      fetchCombinedRefStatus: async (owner, repo) => {
        record(account, 'status', owner, repo)
        return {
          state: 'failure',
          total_count: 1,
          statuses: [
            {
              id: account.id,
              context: account.login,
              state: 'failure',
              description: '',
              target_url: null,
            },
          ],
        }
      },
      fetchRefCheckRuns: async (owner, repo) => {
        record(account, 'checks', owner, repo)
        return { total_count: 0, check_runs: [] }
      },
    })
  )
  return {
    store,
    debug,
    accounts,
    requests,
    emit: async (event: DesktopAliveEvent) => {
      assert.ok(eventHandler)
      await eventHandler(event)
    },
    updateRepositories: (updated: ReadonlyArray<Repository>) => {
      assert.ok(repositoriesChanged)
      repositoriesChanged(updated)
    },
  }
}

const commentEvent: DesktopAliveEvent = {
  type: 'pr-comment',
  subtype: 'issue-comment',
  timestamp: 0,
  owner: 'owner',
  repo: 'repo',
  pull_request_number: 1,
  comment_id: '1',
}
const reviewEvent: DesktopAliveEvent = {
  type: 'pr-review-submit',
  timestamp: 0,
  owner: 'owner',
  repo: 'repo',
  pull_request_number: 1,
  state: 'APPROVED',
  review_id: '1',
}

describe('Notification repository account assignment', () => {
  it('checks commit ownership against the assigned account instead of the first signed-in account', async t => {
    const { store, emit } = await createStores(t)
    const repository = local('second')
    store.selectRepository(repository)
    const check = {
      id: 1,
      name: 'Build',
      description: '',
      status: APICheckStatus.Completed,
      conclusion: APICheckConclusion.Failure,
      appName: '',
      htmlUrl: null,
      checkSuiteId: 1,
    }
    const fetchChecks = t.mock.method(store, 'getChecksForRef', async () => [
      check,
    ])
    const shown = showNotification.mock.callCount()
    await emit({
      type: 'pr-checks-failed',
      timestamp: 0,
      owner: 'owner',
      repo: 'repo',
      pull_request_number: 1,
      check_suite_id: 1,
      commit_sha: 'abc123',
    })
    assert.deepStrictEqual(fetchChecks.mock.calls[0].arguments, [
      repository,
      'refs/pull/1/head',
    ])
    assert.strictEqual(showNotification.mock.callCount(), shown + 1)
  })

  it('does not use an account with the same login on a different endpoint', async t => {
    const { store, debug, requests } = await createStores(t)
    const enterprise = new GitHubRepository(
      'repo',
      new Owner('owner', 'https://enterprise.example/api/v3', 1),
      2
    )
    const repository = local('second', enterprise)
    assert.strictEqual(
      await store.getChecksForRef(repository, 'refs/pull/1/head'),
      null
    )
    assert.deepStrictEqual(
      await debug.getPullRequestComments(repository, 1),
      []
    )
    assert.deepStrictEqual(await debug.getPullRequestReviews(repository, 1), [])
    assert.deepStrictEqual(requests, [])
  })

  it('enriches comments and reviews with the selected local identity, not the first recent clone', async t => {
    const { store, emit, requests } = await createStores(t)
    store.setRecentRepositories([local('first', github, 2), local('second')])
    store.selectRepository(local('second'))
    await emit(commentEvent)
    await emit({ ...commentEvent, subtype: 'review-comment' })
    await emit(reviewEvent)
    assert.deepStrictEqual(requests, [
      ['second', 'comment', 'owner', 'repo'],
      ['second', 'review-comment', 'owner', 'repo'],
      ['second', 'review', 'owner', 'repo'],
    ])
  })

  it('uses only recent repositories for statistics, not account or repository fallback', async t => {
    const { store, emit, requests } = await createStores(t)
    store.setRecentRepositories([local('first'), local('second', github, 2)])
    await emit(commentEvent)
    store.selectRepository(
      local('second', new GitHubRepository('other', github.owner, 2))
    )
    await emit(reviewEvent)
    assert.deepStrictEqual(requests, [])
  })

  for (const login of [null, 'signed-out']) {
    it(`skips background enrichment and checks for ${login} assignment`, async t => {
      const { store, emit, requests } = await createStores(t)
      const repository = local(login)
      store.selectRepository(repository)
      store.setRecentRepositories([local('first', github, 2)])
      await emit(commentEvent)
      await emit(reviewEvent)
      assert.strictEqual(
        await store.getChecksForRef(repository, 'refs/pull/1/head'),
        null
      )
      assert.deepStrictEqual(requests, [])
    })
  }

  it('tracks assignment changes and removal by local repository ID', async t => {
    const { store, emit, requests, updateRepositories } = await createStores(t)
    store.selectRepository(local('first'))
    updateRepositories([local('second'), local('first', github, 2)])
    await emit(commentEvent)
    updateRepositories([local(null), local('first', github, 2)])
    await emit(commentEvent)
    updateRepositories([local('first', github, 2)])
    await emit(commentEvent)
    assert.deepStrictEqual(requests, [['second', 'comment', 'owner', 'repo']])
  })

  it('uses the fork assignment to fetch upstream checks and reviews', async t => {
    const { store, emit, requests } = await createStores(t)
    const fork = new GitHubRepository(
      'fork',
      new Owner('second', endpoint, 2),
      2,
      null,
      null,
      null,
      null,
      null,
      null,
      github
    )
    const repository = local('second', fork)
    store.selectRepository(repository)
    await emit(reviewEvent)
    const checks = await store.getChecksForRef(repository, 'refs/pull/1/head')
    assert.strictEqual(checks?.[0].name, 'second')
    assert.deepStrictEqual(requests, [
      ['second', 'review', 'owner', 'repo'],
      ['second', 'status', 'owner', 'repo'],
      ['second', 'checks', 'owner', 'repo'],
    ])
  })
})

describe('NotificationsDebugStore account isolation', () => {
  it('isolates comments and reviews for the same PR number across accounts and repositories', async t => {
    const { debug, requests } = await createStores(t)
    for (const account of [first, second, first]) {
      const repository = local(account.login)
      assert.strictEqual(
        (await debug.getPullRequestComments(repository, 1))[0].body,
        account.login
      )
      assert.strictEqual(
        (await debug.getPullRequestReviews(repository, 1))[0].body,
        account.login
      )
    }
    assert.strictEqual(requests.length, 6)
    const other = local(
      'second',
      new GitHubRepository('other', github.owner, 2)
    )
    await debug.getPullRequestComments(other, 1)
    await debug.getPullRequestReviews(other, 1)
    assert.deepStrictEqual(requests.slice(-3), [
      ['second', 'comments', 'owner', 'other'],
      ['second', 'review-comments', 'owner', 'other'],
      ['second', 'reviews', 'owner', 'other'],
    ])
  })

  it('does not return cached enrichment after sign-out or for unassigned repositories', async t => {
    const { debug, accounts, requests } = await createStores(t)
    await debug.getPullRequests(local('second'), {
      filterByReviews: true,
      filterByComments: true,
    })
    const count = requests.length
    await accounts.removeAccount(second)
    assert.deepStrictEqual(
      await debug.getPullRequestComments(local('second'), 1),
      []
    )
    assert.deepStrictEqual(
      await debug.getPullRequestReviews(local('second'), 1),
      []
    )
    assert.deepStrictEqual(
      await debug.getPullRequests(local('second'), { filterByReviews: true }),
      []
    )
    assert.deepStrictEqual(
      await debug.getPullRequestComments(local(null), 1),
      []
    )
    assert.strictEqual(requests.length, count)
  })
})
