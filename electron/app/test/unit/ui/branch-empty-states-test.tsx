import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { NoBranches } from '../../../src/ui/branches/no-branches'
import { NoPullRequests } from '../../../src/ui/branches/no-pull-requests'
import { fireEvent, render, screen } from '../../helpers/ui/render'

interface IRenderedNoBranches {
  readonly createCalls: { count: number }
}

function renderNoBranches(
  props: Partial<React.ComponentProps<typeof NoBranches>> = {}
): IRenderedNoBranches {
  const createCalls = { count: 0 }

  function onCreateNewBranch() {
    createCalls.count++
  }

  render(
    <NoBranches
      onCreateNewBranch={onCreateNewBranch}
      canCreateNewBranch={true}
      {...props}
    />
  )

  return { createCalls }
}

describe('branch empty states', () => {
  it('renders the create-branch empty state and invokes the create callback', () => {
    const { createCalls } = renderNoBranches()

    const button = screen.getByRole('button', {
      name: __DARWIN__ ? 'Create New Branch' : 'Create new branch',
    })
    const image = document.querySelector('.no-branches .blankslate-image')
    const protip = document.querySelector('.no-branches .protip')

    assert.notEqual(image, null)
    assert.ok(screen.getByText("Sorry, I can't find that branch"))
    assert.ok(screen.getByText('Do you want to create a new branch instead?'))
    assert.ok(
      protip?.textContent?.includes(__DARWIN__ ? '⌘⇧N' : 'Ctrl+Shift+N')
    )

    fireEvent.click(button)

    assert.equal(createCalls.count, 1)
  })

  it('renders the no-create fallback message when branch creation is unavailable', () => {
    renderNoBranches({
      canCreateNewBranch: false,
      noBranchesMessage: 'No matching branches were found.',
    })

    assert.ok(screen.getByText('No matching branches were found.'))
    assert.equal(
      screen.queryByRole('button', {
        name: __DARWIN__ ? 'Create New Branch' : 'Create new branch',
      }),
      null
    )
  })

  it('renders the search and loading pull-request placeholders', () => {
    const view = render(
      <NoPullRequests
        repositoryName="desktop"
        isOnDefaultBranch={true}
        isSearch={true}
        isLoadingPullRequests={false}
        onCreateBranch={() => {}}
        onCreatePullRequest={() => {}}
      />
    )

    assert.ok(screen.getByText("Sorry, I can't find that pull request!"))

    view.rerender(
      <NoPullRequests
        repositoryName="desktop"
        isOnDefaultBranch={true}
        isSearch={false}
        isLoadingPullRequests={true}
        onCreateBranch={() => {}}
        onCreatePullRequest={() => {}}
      />
    )

    assert.ok(screen.getByText('Hang tight'))
    assert.ok(screen.getByText('Loading pull requests as fast as I can!'))
  })

  it('renders default-branch and feature-branch calls to action and invokes their callbacks', () => {
    const createBranchCalls = { count: 0 }
    const createPullRequestCalls = { count: 0 }

    function onCreateBranch() {
      createBranchCalls.count++
    }

    function onCreatePullRequest() {
      createPullRequestCalls.count++
    }

    const view = render(
      <NoPullRequests
        repositoryName="desktop"
        isOnDefaultBranch={true}
        isSearch={false}
        isLoadingPullRequests={false}
        onCreateBranch={onCreateBranch}
        onCreatePullRequest={onCreatePullRequest}
      />
    )

    assert.ok(screen.getByText("You're all set!"))
    assert.ok(screen.getByText('No open pull requests in'))
    assert.ok(screen.getByText('desktop'))
    assert.notEqual(
      view.container.querySelector('.no-pull-requests .blankslate-image'),
      null
    )

    const createBranchButton = screen.getByRole('button', {
      name: 'create a new branch',
    })

    fireEvent.click(createBranchButton)

    assert.equal(createBranchCalls.count, 1)

    view.rerender(
      <NoPullRequests
        repositoryName="desktop"
        isOnDefaultBranch={false}
        isSearch={false}
        isLoadingPullRequests={false}
        onCreateBranch={onCreateBranch}
        onCreatePullRequest={onCreatePullRequest}
      />
    )

    const createPullRequestButton = screen.getByRole('button', {
      name: 'create a pull request',
    })

    fireEvent.click(createPullRequestButton)

    assert.equal(createPullRequestCalls.count, 1)
  })
})
