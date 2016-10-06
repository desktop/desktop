import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import { findDOMNode } from 'react-dom'
import { render } from '../render-utils'

import { Changes } from '../../src/ui/changes'

import { IChangesState } from '../../src/lib/app-state'
import { Repository } from '../../src/models/repository'
import { Dispatcher, AppStore, GitHubUserStore, CloningRepositoriesStore, EmojiStore, IGitHubUser } from '../../src/lib/dispatcher'
import { LocalGitOperations } from '../../src/lib/local-git-operations'

import { InMemoryDispatcher } from '../in-memory-dispatcher'
import { TestDatabase } from '../test-github-user-database'
import { setupFixtureRepository } from '../fixture-helper'

describe('<Changes />', () => {
  const emoji = new Map<string, string>()
  const gitHubUsers = new Map<string, IGitHubUser>()
  let appStore: AppStore | null = null
  let dispatcher: Dispatcher | null = null

  beforeEach(async () => {
    const db = new TestDatabase()
    await db.reset()

    appStore = new AppStore(new GitHubUserStore(db), new CloningRepositoriesStore(), new EmojiStore())

    dispatcher = new InMemoryDispatcher(appStore)
  })

  it('renders list of changes', async () => {

    const testRepoPath = setupFixtureRepository('changes-to-commit')
    const repository = new Repository(testRepoPath, -1, null)

    const status = await LocalGitOperations.getStatus(repository)

    const state: IChangesState = {
      workingDirectory: status.workingDirectory,
      selectedFile: null,
      diff: null,
    }

    const changes = render(
      <Changes branch='master'
               changes={state}
               commitAuthor={null}
               dispatcher={dispatcher!}
               emoji={emoji!}
               gitHubUsers={gitHubUsers!}
               repository={repository} />,
      // TODO: we should just load the app's stylesheets here
      '.list { height: 400px; width: 250px }'
    )

    const node = findDOMNode(changes)

    // TODO: can we refer to components here rather than class files
    const files = node.getElementsByClassName('changed-file')
    expect(files.length).to.equal(4)
  })
})
