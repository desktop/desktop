import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as Path from 'path'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepositoryListItem } from '../../../src/ui/repositories-list/repository-list-item'
import { render, fireEvent, screen, waitFor } from '../../helpers/ui/render'
import { IMatches } from '../../../src/lib/fuzzy-find'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const noMatches: IMatches = { title: [], subtitle: [] }
const fixtureRepositoryPath = '/tmp/desktop-fixture'

function createRepository(alias: string | null = null) {
  const owner = new Owner('octocat', 'https://api.github.com', 1)
  const gitHubRepository = new GitHubRepository('desktop', owner, 99)

  return new Repository(
    fixtureRepositoryPath,
    123,
    gitHubRepository,
    false,
    alias
  )
}

function createWorkTreeRepository(
  path: string,
  mainRepoPath: string,
  gitHubRepository: GitHubRepository | null = null,
  alias: string | null = null
) {
  const worktreeName = path.split('/').pop() ?? 'wt'
  const gitDir = `${mainRepoPath}/.git/worktrees/${worktreeName}`

  return new Repository(
    path,
    456,
    gitHubRepository,
    false,
    alias,
    {},
    false,
    gitDir
  )
}

describe('RepositoryListItem', () => {
  beforeEach(() => {
    enableTestTimers(['setTimeout'])
  })

  afterEach(() => {
    resetTestTimers()
  })

  it('renders the repository name and status indicators', () => {
    const repository = createRepository()
    const view = render(
      <RepositoryListItem
        repository={repository}
        needsDisambiguation={false}
        matches={noMatches}
        aheadBehind={{ ahead: 2, behind: 1 }}
        changedFilesCount={3}
      />
    )

    const name = view.container.querySelector('.name')
    const aheadBehind = view.container.querySelector('.ahead-behind')
    const changeIndicator = view.container.querySelector(
      '.change-indicator-wrapper'
    )

    assert.equal(name?.textContent, 'desktop')
    assert.notEqual(aheadBehind, null)
    assert.notEqual(changeIndicator, null)
    assert.equal(aheadBehind?.querySelectorAll('svg').length, 2)
  })

  it('renders owner prefix and alias when disambiguation is required', () => {
    const repository = createRepository('desktop-app')
    const view = render(
      <RepositoryListItem
        repository={repository}
        needsDisambiguation={true}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
      />
    )

    const prefix = view.container.querySelector('.prefix')
    const name = view.container.querySelector('.name')

    assert.equal(prefix?.textContent, 'octocat/')
    assert.equal(name?.textContent, 'octocat/desktop-app')
  })

  it('appends the worktree folder name to a GitHub worktree repository', () => {
    const owner = new Owner('octocat', 'https://api.github.com', 1)
    const gitHubRepository = new GitHubRepository('foo', owner, 99)
    const repository = createWorkTreeRepository(
      '/tmp/foo-worktree',
      '/tmp/foo',
      gitHubRepository
    )

    const view = render(
      <RepositoryListItem
        repository={repository}
        needsDisambiguation={false}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
      />
    )

    const name = view.container.querySelector('.name')
    const suffix = view.container.querySelector('.worktree-suffix')

    assert.equal(name?.textContent, 'foo (foo-worktree)')
    assert.equal(suffix?.textContent, ' (foo-worktree)')
  })

  it('uses the main repository folder name for non-GitHub worktrees', () => {
    const repository = createWorkTreeRepository(
      Path.join('/tmp', 'foo-worktree'),
      Path.join('/tmp', 'foo')
    )

    const view = render(
      <RepositoryListItem
        repository={repository}
        needsDisambiguation={false}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
      />
    )

    const name = view.container.querySelector('.name')
    assert.equal(name?.textContent, 'foo (foo-worktree)')
  })

  it('does not append a worktree suffix for normal repositories', () => {
    const repository = createRepository()
    const view = render(
      <RepositoryListItem
        repository={repository}
        needsDisambiguation={false}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
      />
    )

    const suffix = view.container.querySelector('.worktree-suffix')
    assert.equal(suffix, null)
  })

  it('shows tooltip content for the repository full name, alias, and path', async () => {
    const repository = createRepository('desktop-app')
    const view = render(
      <RepositoryListItem
        repository={repository}
        needsDisambiguation={true}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
      />
    )

    const row = view.container.querySelector('.repository-list-item')

    assert.notEqual(row, null)

    if (row === null) {
      throw new Error('Expected repository row to be rendered')
    }

    fireEvent.mouseEnter(row, { clientX: 20, clientY: 20 })
    fireEvent.mouseMove(row, { clientX: 20, clientY: 20 })
    advanceTimersBy(400)

    await waitFor(() => {
      assert.ok(screen.getByText('octocat/desktop', { selector: 'strong' }))
      assert.ok(screen.getByText(fixtureRepositoryPath))
    })
  })
})
