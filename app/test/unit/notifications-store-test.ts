import assert from 'node:assert'
import { describe, it, mock, TestContext } from 'node:test'
import { DesktopAliveEvent } from '../../src/lib/stores/alive-store'

let notificationShown = false
const show = mock.fn(async () => notificationShown)
mock.module('../../src/lib/notifications/show-notification', {
  namedExports: { showNotification: show },
})

describe('NotificationsStore', async () => {
  const { NotificationsStore } = await import(
    '../../src/lib/stores/notifications-store'
  )
  const { AliveStore } = await import('../../src/lib/stores/alive-store')
  const { PullRequestCoordinator } = await import(
    '../../src/lib/stores/pull-request-coordinator'
  )
  const {
    createTestAccountsStore,
    createTestRepositoriesStore,
    createTestPullRequestStore,
  } = await import('../helpers/app-store-test-harness')
  const { StatsStore } = await import('../../src/lib/stats')
  const { TestStatsDatabase } = await import('../helpers/databases')
  const { TestActivityMonitor } = await import(
    '../helpers/test-activity-monitor'
  )
  const { TestStatsStore } = await import('../helpers/test-stats-store')
  const { fakePost } = await import('../fake-stats-post')
  const { setupEmptyRepository } = await import('../helpers/repositories')
  const { makeCommit } = await import('../helpers/repository-scaffolding')
  const { getTipOrError } = await import('../helpers/git')
  const { Account } = await import('../../src/models/account')
  const { Repository } = await import('../../src/models/repository')
  const { GitHubRepository } = await import(
    '../../src/models/github-repository'
  )
  const { Owner } = await import('../../src/models/owner')
  const { PullRequest, PullRequestRef } = await import(
    '../../src/models/pull-request'
  )
  const { API, APICheckConclusion, APICheckStatus } = await import(
    '../../src/lib/api'
  )
  const { createMockAPI, createMockAPIIdentity, createMockAPIEmail } =
    await import('../helpers/mock-api')

  async function createHarness(t: TestContext) {
    show.mock.resetCalls()
    const localRepository = await setupEmptyRepository(t)
    await makeCommit(localRepository, {
      entries: [{ path: 'README.md', contents: 'Notification test' }],
    })
    const commit = await getTipOrError(localRepository)
    const endpoint = 'https://api.github.com'
    const gitHubRepository = new GitHubRepository(
      'repo',
      new Owner('owner', endpoint, 1),
      1
    )
    const repository = new Repository(
      localRepository.path,
      1,
      gitHubRepository,
      false
    )
    const ref = new PullRequestRef('main', commit.sha, gitHubRepository)
    const pullRequest = new PullRequest(
      new Date(),
      'Test PR',
      1,
      ref,
      ref,
      'author',
      false,
      ''
    )
    const accounts = createTestAccountsStore()
    t.mock.method(accounts, 'getAll', async () => [
      new Account(
        'author',
        endpoint,
        'test-token',
        [createMockAPIEmail(commit.author.email)],
        '',
        1,
        'Author'
      ),
    ])
    const alive = new AliveStore(accounts)
    t.mock.method(alive, 'setEnabled', () => {})
    let onAliveEvent: ((event: DesktopAliveEvent) => void) | undefined
    t.mock.method(
      alive,
      'onAliveEventReceived',
      (callback: (event: DesktopAliveEvent) => void) => {
        onAliveEvent = callback
      }
    )
    const repositories = createTestRepositoriesStore()
    t.mock.method(repositories, 'getAll', async () => [])
    const coordinator = new PullRequestCoordinator(
      createTestPullRequestStore(repositories),
      repositories
    )
    t.mock.method(coordinator, 'getAllPullRequests', async () => [pullRequest])
    const statsDb = new TestStatsDatabase()
    t.after(() => statsDb.close())
    const stats = new StatsStore(statsDb, new TestActivityMonitor(), fakePost)
    const metrics = new TestStatsStore()
    t.mock.method(stats, 'increment', metrics.increment)
    const store = new NotificationsStore(accounts, alive, coordinator, stats)
    store.selectRepository(repository)
    t.mock.method(store, 'getChecksForRef', async () => [
      {
        id: 1,
        name: 'Test',
        description: 'Failed',
        status: APICheckStatus.Completed,
        conclusion: APICheckConclusion.Failure,
        appName: 'Test',
        htmlUrl: null,
        checkSuiteId: 1,
      },
    ])
    const user = createMockAPIIdentity()
    const api = createMockAPI({
      fetchIssueComment: async () => ({
        id: 1,
        body: 'Comment',
        html_url: '',
        user,
        created_at: '',
      }),
      fetchPullRequestReview: async (_owner, _repo, _number, reviewID) => ({
        id: 1,
        body: 'Review',
        html_url: '',
        user,
        submitted_at: '',
        state:
          reviewID === 'APPROVED'
            ? 'APPROVED'
            : reviewID === 'CHANGES_REQUESTED'
            ? 'CHANGES_REQUESTED'
            : 'COMMENTED',
      }),
    })
    t.mock.method(API, 'fromAccount', () => api)
    assert.ok(onAliveEvent)
    return {
      store,
      metrics,
      onAliveEvent,
      commitSHA: commit.sha,
      coordinator,
    }
  }

  const commonEvent = {
    timestamp: 1,
    owner: 'owner',
    repo: 'repo',
    pull_request_number: 1,
  }
  const cases = [
    {
      event: {
        ...commonEvent,
        type: 'pr-checks-failed',
        check_suite_id: 1,
        commit_sha: '',
      },
      count: 'checksFailedNotificationCount',
      shown: 'checksFailedNotificationShownCount',
    },
    {
      event: {
        ...commonEvent,
        type: 'pr-comment',
        subtype: 'issue-comment',
        comment_id: '1',
      },
      count: 'pullRequestCommentNotificationCount',
      shown: 'pullRequestCommentNotificationShownCount',
    },
    ...(['APPROVED', 'COMMENTED', 'CHANGES_REQUESTED'] as const).map(state => ({
      event: {
        ...commonEvent,
        type: 'pr-review-submit' as const,
        state,
        review_id: state,
      },
      count:
        state === 'APPROVED'
          ? 'pullRequestReviewApprovedNotificationCount'
          : state === 'COMMENTED'
          ? 'pullRequestReviewCommentedNotificationCount'
          : 'pullRequestReviewChangesRequestedNotificationCount',
      shown:
        state === 'APPROVED'
          ? 'pullRequestReviewApprovedNotificationShownCount'
          : state === 'COMMENTED'
          ? 'pullRequestReviewCommentedNotificationShownCount'
          : 'pullRequestReviewChangesRequestedNotificationShownCount',
    })),
  ] as const

  for (const testCase of cases) {
    for (const shown of [false, true]) {
      it(`tracks ${testCase.count} separately when shown=${shown}`, async t => {
        notificationShown = shown
        const harness = await createHarness(t)
        const event =
          testCase.event.type === 'pr-checks-failed'
            ? { ...testCase.event, commit_sha: harness.commitSHA }
            : testCase.event

        await harness.onAliveEvent(event)

        assert.deepStrictEqual(harness.metrics.metrics, {
          [testCase.count]: 1,
          ...(shown ? { [testCase.shown]: 1 } : {}),
        })
        assert.strictEqual(show.mock.callCount(), 1)
      })
    }
  }

  for (const testCase of cases) {
    it(`does not count clicks as new ${testCase.count} attempts or displays`, async t => {
      const { store, metrics, commitSHA } = await createHarness(t)
      const event =
        testCase.event.type === 'pr-checks-failed'
          ? { ...testCase.event, commit_sha: commitSHA }
          : testCase.event
      await store.onNotificationEventReceived('click', 'id', event)
      assert.deepStrictEqual(metrics.metrics, {
        [testCase.count.replace(/Count$/, 'Clicked')]: 1,
      })
      assert.strictEqual(show.mock.callCount(), 0)
    })
  }

  it('does not double-count notifications for the same failed checks', async t => {
    notificationShown = true
    const { onAliveEvent, metrics, commitSHA } = await createHarness(t)
    const event: DesktopAliveEvent = {
      ...commonEvent,
      type: 'pr-checks-failed',
      check_suite_id: 1,
      commit_sha: commitSHA,
    }
    await onAliveEvent(event)
    await onAliveEvent(event)
    assert.deepStrictEqual(metrics.metrics, {
      checksFailedNotificationCount: 1,
      checksFailedNotificationShownCount: 1,
    })
    assert.strictEqual(show.mock.callCount(), 1)
  })

  it('does not count events for another repository as shown', async t => {
    const { onAliveEvent, metrics } = await createHarness(t)
    await onAliveEvent({
      ...commonEvent,
      repo: 'another-repo',
      type: 'pr-comment',
      subtype: 'issue-comment',
      comment_id: '1',
    })
    assert.deepStrictEqual(metrics.metrics, {
      pullRequestCommentNotificationFromNonRecentRepoCount: 1,
    })
    assert.strictEqual(show.mock.callCount(), 0)
  })

  it('does not count an uncached PR as eligible or shown', async t => {
    const { onAliveEvent, metrics, coordinator } = await createHarness(t)
    t.mock.method(coordinator, 'getAllPullRequests', async () => [])
    await onAliveEvent({
      ...commonEvent,
      type: 'pr-comment',
      subtype: 'issue-comment',
      comment_id: '1',
    })
    assert.deepStrictEqual(metrics.metrics, {})
    assert.strictEqual(show.mock.callCount(), 0)
  })
})
