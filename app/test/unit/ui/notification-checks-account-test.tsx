import assert from 'node:assert'
import { before, beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { API, APICheckConclusion, APICheckStatus } from '../../../src/lib/api'
import * as checksModule from '../../../src/lib/ci-checks/ci-checks'
import { Account } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { PullRequest, PullRequestRef } from '../../../src/models/pull-request'
import {
  Repository,
  assertIsRepositoryWithGitHubRepository,
} from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { createMockAPI } from '../../helpers/mock-api'
import { render, waitFor } from '../../helpers/ui/render'

const endpoint = 'https://api.github.com'
const first = new Account('first', endpoint, 'first-token', [], '', 1, '')
const second = new Account('second', endpoint, 'second-token', [], '', 2, '')
const github = new GitHubRepository('repo', new Owner('owner', endpoint, 1), 1)
const ref = new PullRequestRef('branch', 'abc123', github)
const pullRequest = new PullRequest(
  new Date(),
  'PR',
  1,
  ref,
  ref,
  'second',
  false,
  ''
)
const checks: ReadonlyArray<checksModule.IRefCheck> = [
  {
    id: 1,
    name: 'Build',
    description: '',
    status: APICheckStatus.Completed,
    conclusion: APICheckConclusion.Failure,
    appName: '',
    htmlUrl: null,
    checkSuiteId: 1,
  },
]
const workflows = mock.fn<typeof checksModule.getCheckRunActionsWorkflowRuns>(
  async (_account, _owner, _name, _ref, original) => original
)
const logs = mock.fn<
  typeof checksModule.getLatestPRWorkflowRunsLogsForCheckRun
>(async (_api, _owner, _name, original) => original)

before(() => {
  mock.module('../../../src/ui/main-process-proxy.ts', {
    namedExports: { sendDialogDidOpen: () => {} },
  })
  mock.module('../../../src/lib/ci-checks/ci-checks.ts', {
    namedExports: {
      ...checksModule,
      getCheckRunActionsWorkflowRuns: workflows,
      getLatestPRWorkflowRunsLogsForCheckRun: logs,
    },
  })
})

beforeEach(() => {
  workflows.mock.resetCalls()
  workflows.mock.mockImplementation(
    async (_account, _owner, _name, _ref, original) => original
  )
  logs.mock.resetCalls()
})

function local(login: string | null) {
  const repository = new Repository(
    '/repo',
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
  assertIsRepositoryWithGitHubRepository(repository)
  return repository
}

async function renderChecks(
  login: string | null,
  accounts: ReadonlyArray<Account> = [first, second]
) {
  const { PullRequestChecksFailed } = await import(
    '../../../src/ui/notifications/pull-request-checks-failed'
  )
  const dispatcher: Pick<Dispatcher, 'incrementMetric' | 'showPopup'> = {
    incrementMetric: async () => {},
    showPopup: async () => {},
  }
  const props = {
    dispatcher: dispatcher as Dispatcher,
    shouldChangeRepository: false,
    repository: local(login),
    accounts,
    pullRequest,
    checks,
    onSubmit: () => {},
    onDismissed: () => {},
  }
  const view = render(<PullRequestChecksFailed {...props} />)
  return {
    ...view,
    update: (assigned: string | null, updatedAccounts = accounts) =>
      view.rerender(
        <PullRequestChecksFailed
          {...props}
          repository={local(assigned)}
          accounts={updatedAccounts}
        />
      ),
  }
}

describe('Notification check log account selection', () => {
  it('uses the explicit assigned account for workflow and log enrichment', async t => {
    const used: Account[] = []
    const api = createMockAPI()
    t.mock.method(API, 'fromAccount', (account: Account) => {
      used.push(account)
      return api
    })
    await renderChecks('second')
    await waitFor(() => assert.strictEqual(logs.mock.callCount(), 1))
    assert.deepStrictEqual(used, [second])
    assert.strictEqual(workflows.mock.calls[0].arguments[0], second)
    assert.strictEqual(logs.mock.calls[0].arguments[0], api)
  })

  for (const login of [null, 'signed-out']) {
    it(`skips enrichment without prompting for ${login} assignment`, async t => {
      const api = t.mock.method(API, 'fromAccount', () => {
        throw new Error('Must not authenticate without an assigned account')
      })
      const view = await renderChecks(login)
      assert.strictEqual(api.mock.callCount(), 0)
      assert.strictEqual(workflows.mock.callCount(), 0)
      assert.strictEqual(
        view.container.querySelector('.loading-check-runs'),
        null
      )
    })
  }

  it('drops in-flight work when the assignment changes or the account signs out', async t => {
    t.mock.method(API, 'fromAccount', () => createMockAPI())
    let finish:
      | ((result: ReadonlyArray<checksModule.IRefCheck>) => void)
      | undefined
    workflows.mock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        })
    )
    const view = await renderChecks('first')
    view.update('second')
    await waitFor(() => assert.strictEqual(logs.mock.callCount(), 1))
    assert.strictEqual(workflows.mock.calls[1].arguments[0], second)
    assert.ok(finish)
    finish([{ ...checks[0], name: 'Stale account result' }])
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.strictEqual(logs.mock.callCount(), 1)
    assert.strictEqual(
      view.container.textContent?.includes('Stale account result'),
      false
    )
    view.update('second', [first])
    assert.strictEqual(workflows.mock.callCount(), 2)
    assert.strictEqual(
      view.container.querySelector('.loading-check-runs'),
      null
    )
  })
})
