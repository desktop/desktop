import assert from 'node:assert'
import { before, it, mock } from 'node:test'
import * as React from 'react'
import { Disposable } from 'event-kit'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { PullRequest, PullRequestRef } from '../../../src/models/pull-request'
import { Repository } from '../../../src/models/repository'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { render } from '../../helpers/ui/render'

before(() => {
  mock.module('../../../src/ui/lib/sandboxed-markdown.tsx', {
    namedExports: { SandboxedMarkdown: () => null },
  })
})

it('passes the local account context through the quick view badge to CI status', async () => {
  const { PullRequestQuickView } = await import(
    '../../../src/ui/pull-request-quick-view'
  )
  const github = new GitHubRepository(
    'repo',
    new Owner('owner', 'https://api.github.com', 1),
    1
  )
  const ref = new PullRequestRef('branch', 'abc123', github)
  const pullRequest = new PullRequest(
    new Date(),
    'PR',
    42,
    ref,
    ref,
    'second',
    false,
    ''
  )
  const repository = (login: string) =>
    new Repository(
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
  const first = repository('first')
  const second = repository('second')
  const subscriptions: Array<readonly [GitHubRepository, Repository, string]> =
    []
  const dispatcher: Pick<
    Dispatcher,
    'tryGetCommitStatus' | 'subscribeToCommitStatus'
  > = {
    tryGetCommitStatus: () => null,
    subscribeToCommitStatus: (target, local, commitRef) => {
      subscriptions.push([target, local, commitRef])
      return new Disposable()
    },
  }
  const props = {
    dispatcher: dispatcher as Dispatcher,
    pullRequest,
    pullRequestItemTop: 0,
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    emoji: new Map(),
    underlineLinks: false,
  }
  const view = render(
    <PullRequestQuickView {...props} localRepository={first} />
  )
  view.rerender(<PullRequestQuickView {...props} localRepository={second} />)
  assert.deepStrictEqual(subscriptions, [
    [github, first, 'refs/pull/42/head'],
    [github, second, 'refs/pull/42/head'],
  ])
})
