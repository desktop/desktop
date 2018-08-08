/* tslint:disable:react-this-binding-issue */

import * as React from 'react'
import { expect } from 'chai'

import { render, cleanup } from 'react-testing-library'

import { PullRequestList } from '../../../src/ui/branches/pull-request-list'
import { PullRequest } from '../../../src/models/pull-request'

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

  it(`renders the filter list when a list of PRs received`, () => {
    const repositoryName = 'shiftkey/desktop'

    const someTimeAgo = new Date('2018-08-01T18:58:13Z')
    const endpoint = 'https://api.github.com/'

    const gitHubRepository = {
      dbID: 1,
      name: 'some-repo',
      fullName: 'shiftkey/desktop',
      owner: {
        id: 1234,
        login: 'shiftkey',
        endpoint,
        hash: 'some-hash',
      },
      private: false,
      fork: false,
      hash: 'another-hash',
      htmlURL: 'https://github.com/shiftkey/desktop',
      defaultBranch: 'master',
      cloneURL: 'https://github.com/shiftkey/desktop.git',
      parent: null,
      endpoint,
    }

    const pullRequests: Array<PullRequest> = [
      {
        id: 20,
        created: someTimeAgo,
        title: 'the first PR',
        number: 1,
        head: { ref: 'some-branch', sha: 'deadbeef', gitHubRepository },
        base: { ref: 'master', sha: 'deadbeef2', gitHubRepository },
        author: 'shiftkey',
        status: null,
      },
      {
        id: 21,
        created: someTimeAgo,
        title: 'the second PR',
        number: 2,
        head: { ref: 'another-branch', sha: 'deadbeef', gitHubRepository },
        base: { ref: 'master', sha: 'deadbeef2', gitHubRepository },
        author: 'shiftkey',
        status: null,
      },
    ]

    const { container } = render(
      <PullRequestList
        pullRequests={pullRequests}
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

    // confirm the filter list is shown
    const outerElement = container.getElementsByClassName('pull-request-list')
    expect(outerElement.length).equals(1)

    // confirm two items inside pull request list
    const items = container.getElementsByClassName('pull-request-item')
    expect(items.length).equals(2)
    expect(items[0].textContent!.includes('first'))
    expect(items[1].textContent!.includes('second'))
  })
})
