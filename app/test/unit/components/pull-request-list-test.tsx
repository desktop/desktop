/* tslint:disable:react-this-binding-issue */

import * as React from 'react'
import { expect } from 'chai'

import { render, cleanup } from 'react-testing-library'

import { PullRequestList } from '../../../src/ui/branches/pull-request-list'

const ignoreCallback = () => {}

describe('<PullRequestList />', () => {
  afterEach(cleanup)

  it(`renders the 'no-prs' UI when empty list of PRs received`, () => {
    const repositoryName = 'shiftkey/desktop'

    const { container } = render(
      <PullRequestList
        pullRequests={[]}
        selectedPullRequest={null}
        repositoryName={repositoryName}
        isOnDefaultBranch={true}
        filterText=""
        onItemClick={ignoreCallback}
        onDismiss={ignoreCallback}
        onFilterTextChanged={ignoreCallback}
        onCreateBranch={ignoreCallback}
        onCreatePullRequest={ignoreCallback}
      />
    )

    // confirm the UI for no-pull requests is shown
    const outerElement = container.getElementsByClassName('no-pull-requests')
    expect(outerElement.length).equals(1)

    // confirm the repository name is displayed in the list
    const title = container.getElementsByClassName('no-prs')
    expect(title.length).equals(1)
    expect(title[0].textContent!.includes(repositoryName))
  })
})
