import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { Disposable } from 'event-kit'

import { APICheckConclusion, APICheckStatus } from '../../../src/lib/api'
import { ICombinedRefCheck } from '../../../src/lib/ci-checks/ci-checks'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { CIStatus } from '../../../src/ui/branches/ci-status'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { fireEvent, render, screen } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const repository = new GitHubRepository(
  'desktop',
  new Owner('desktop', 'https://api.github.com', 1),
  1
)
const localRepository = new Repository('desktop', 1, repository, false)

function renderStatus(check: ICombinedRefCheck | null) {
  const dispatcher: Pick<
    Dispatcher,
    'tryGetCommitStatus' | 'subscribeToCommitStatus'
  > = {
    tryGetCommitStatus: () => check,
    subscribeToCommitStatus: () => new Disposable(),
  }

  return render(
    <CIStatus
      dispatcher={dispatcher as Dispatcher}
      repository={repository}
      localRepository={localRepository}
      commitRef="refs/pull/467/head"
    />
  )
}

describe('CIStatus', () => {
  beforeEach(() => enableTestTimers(['setTimeout']))
  afterEach(() => resetTestTimers())

  const cases: ReadonlyArray<readonly [APICheckConclusion | null, string]> = [
    [APICheckConclusion.Success, 'Successful'],
    [APICheckConclusion.Failure, 'Failed'],
    [APICheckConclusion.Neutral, 'Neutral'],
    [APICheckConclusion.Canceled, 'Canceled'],
    [APICheckConclusion.TimedOut, 'Timed out'],
    [APICheckConclusion.ActionRequired, 'Action required'],
    [APICheckConclusion.Skipped, 'Skipped'],
    [APICheckConclusion.Stale, 'Marked as stale'],
    [null, 'In progress'],
  ]

  for (const [conclusion, description] of cases) {
    it(`labels the icon and shows a tooltip for ${description}`, () => {
      const status =
        conclusion === null
          ? APICheckStatus.InProgress
          : APICheckStatus.Completed
      const view = renderStatus({
        status,
        conclusion,
        checks: [
          {
            id: 1,
            name: 'Build',
            description,
            status,
            conclusion,
            appName: 'GitHub Actions',
            htmlUrl: null,
            checkSuiteId: null,
          },
        ],
      })
      const icon = view.container.querySelector('svg.ci-status')
      assert.ok(icon)
      assert.strictEqual(
        icon.getAttribute('aria-label'),
        `Checks: ${description}`
      )
      assert.strictEqual(icon.getAttribute('aria-hidden'), null)
      assert.strictEqual(icon.getAttribute('tabindex'), '-1')

      fireEvent.mouseEnter(icon, { clientX: 20, clientY: 20 })
      advanceTimersBy(400)

      const tooltip = screen.getByRole('tooltip', { hidden: true })
      assert.strictEqual(tooltip.textContent, `Checks: ${description}`)
      assert.notStrictEqual(tooltip.style.visibility, 'hidden')
      assert.strictEqual(icon.getAttribute('aria-describedby'), null)
    })
  }

  it('renders nothing when status is unavailable or there are no checks', () => {
    assert.strictEqual(renderStatus(null).container.childElementCount, 0)
    assert.strictEqual(
      renderStatus({
        status: APICheckStatus.Completed,
        conclusion: APICheckConclusion.Success,
        checks: [],
      }).container.childElementCount,
      0
    )
  })

  it('clears the old status and resubscribes when the account assignment changes', () => {
    const check: ICombinedRefCheck = {
      status: APICheckStatus.Completed,
      conclusion: APICheckConclusion.Success,
      checks: [
        {
          id: 1,
          name: 'Build',
          description: '',
          status: APICheckStatus.Completed,
          conclusion: APICheckConclusion.Success,
          appName: '',
          htmlUrl: null,
          checkSuiteId: null,
        },
      ],
    }
    const assignedRepository = new Repository(
      'desktop',
      1,
      repository,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'second'
    )
    const subscriptions: Repository[] = []
    let disposed = 0
    const updates: (ICombinedRefCheck | null)[] = []
    const dispatcher: Pick<
      Dispatcher,
      'tryGetCommitStatus' | 'subscribeToCommitStatus'
    > = {
      tryGetCommitStatus: (_githubRepository, local) =>
        local === localRepository ? check : null,
      subscribeToCommitStatus: (_githubRepository, local) => {
        subscriptions.push(local)
        return new Disposable(() => disposed++)
      },
    }
    const view = render(
      <CIStatus
        dispatcher={dispatcher as Dispatcher}
        repository={repository}
        localRepository={localRepository}
        commitRef="refs/pull/467/head"
        onCheckChange={status => updates.push(status)}
      />
    )
    assert.ok(view.container.querySelector('.ci-status'))

    view.rerender(
      <CIStatus
        dispatcher={dispatcher as Dispatcher}
        repository={repository}
        localRepository={assignedRepository}
        commitRef="refs/pull/467/head"
        onCheckChange={status => updates.push(status)}
      />
    )
    assert.strictEqual(view.container.childElementCount, 0)
    assert.deepStrictEqual(subscriptions, [localRepository, assignedRepository])
    assert.strictEqual(disposed, 1)
    assert.deepStrictEqual(updates, [check, null])
  })
})
