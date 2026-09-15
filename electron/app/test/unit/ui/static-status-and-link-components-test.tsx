import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { ComputedAction } from '../../../src/models/computed-action'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import {
  isRepositoryWithForkedGitHubRepository,
  Repository,
} from '../../../src/models/repository'
import { ForkContributionTarget } from '../../../src/models/workflow-preferences'
import { ActionStatusIcon } from '../../../src/ui/lib/action-status-icon'
import { SegmentedItem } from '../../../src/ui/lib/vertical-segmented-control/segmented-item'
import { RepoRulesetLink } from '../../../src/ui/repository-rules/repo-ruleset-link'
import { ForkSettingsDescription } from '../../../src/ui/repository-settings/fork-contribution-target-description'
import { render, screen } from '../../helpers/ui/render'

function createForkRepository() {
  const owner = new Owner('desktop', 'https://api.github.com', 1)
  const parentOwner = new Owner('github', 'https://api.github.com', 2)
  const parent = new GitHubRepository(
    'desktop',
    parentOwner,
    2,
    false,
    'https://github.com/github/desktop'
  )
  const fork = new GitHubRepository(
    'desktop',
    owner,
    1,
    false,
    'https://github.com/desktop/desktop',
    null,
    null,
    null,
    null,
    parent
  )

  return new Repository('/tmp/desktop', 1, fork, false)
}

describe('static status and link components', () => {
  it('renders repo ruleset links with the expected ruleset url', () => {
    const repository = new GitHubRepository(
      'desktop',
      new Owner('desktop', 'https://api.github.com', 1),
      1,
      false,
      'https://github.com/desktop/desktop'
    )

    render(
      <RepoRulesetLink repository={repository} rulesetId={42}>
        View ruleset
      </RepoRulesetLink>
    )

    const link = screen.getByRole('link', { name: 'View ruleset' })

    assert.ok(link.classList.contains('repo-ruleset-link'))
    assert.equal(
      link.getAttribute('href'),
      'https://github.com/desktop/desktop/rules/42'
    )
  })

  it('renders fork settings descriptions for self and parent contribution targets', () => {
    const repository = createForkRepository()

    if (!isRepositoryWithForkedGitHubRepository(repository)) {
      throw new Error('Expected fork repository')
    }
    const view = render(
      <ForkSettingsDescription
        repository={repository}
        forkContributionTarget={ForkContributionTarget.Self}
      />
    )

    const items = Array.from(view.container.querySelectorAll('li')).map(item =>
      item.textContent?.trim()
    )

    assert.equal(items.length, 5)
    assert.ok(items.every(item => item?.includes('desktop/desktop')))

    view.rerender(
      <ForkSettingsDescription
        repository={repository}
        forkContributionTarget={ForkContributionTarget.Parent}
      />
    )

    const rerenderedItems = Array.from(
      view.container.querySelectorAll('li')
    ).map(item => item.textContent?.trim())

    assert.ok(rerenderedItems.every(item => item?.includes('github/desktop')))
  })

  it('renders action status icons for each computed state and hides null status', () => {
    const view = render(
      <>
        <ActionStatusIcon
          classNamePrefix="merge"
          status={{ kind: ComputedAction.Loading }}
        />
        <ActionStatusIcon
          classNamePrefix="merge"
          status={{ kind: ComputedAction.Clean }}
        />
        <ActionStatusIcon
          classNamePrefix="merge"
          status={{ kind: ComputedAction.Conflicts }}
        />
        <ActionStatusIcon
          classNamePrefix="merge"
          status={{ kind: ComputedAction.Invalid }}
        />
        <ActionStatusIcon classNamePrefix="merge" status={null} />
      </>
    )

    assert.equal(
      view.container.querySelectorAll('.merge-icon-container').length,
      4
    )
    assert.notEqual(view.container.querySelector('.merge-loading'), null)
    assert.notEqual(view.container.querySelector('.merge-clean'), null)
    assert.notEqual(view.container.querySelector('.merge-conflicts'), null)
    assert.notEqual(view.container.querySelector('.merge-invalid'), null)
  })

  it('renders segmented item titles and optional descriptions', () => {
    const view = render(
      <>
        <SegmentedItem
          title="Keep changes"
          description="Stash them on this branch."
        />
        <SegmentedItem title="Move changes" />
      </>
    )

    const titles = Array.from(view.container.querySelectorAll('.title')).map(
      title => title.textContent
    )
    const paragraphs = Array.from(view.container.querySelectorAll('p')).map(
      paragraph => paragraph.textContent
    )

    assert.deepEqual(titles, ['Keep changes', 'Move changes'])
    assert.deepEqual(paragraphs, ['Stash them on this branch.'])
  })
})
