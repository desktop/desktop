import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import { getParentNode } from '../render-utils'
import { mount } from 'enzyme'

import { Changes } from '../../src/ui/changes'
import { ChangedFile } from '../../src/ui/changes/changed-file'
import { CommitMessage } from '../../src/ui/changes/commit-message'

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



    // TODO: we should just load the app's stylesheets here
    //const stylesheet = await getStylesheet()
    const stylesheet = '.list { height: 400px; width: 250px }'
    const attachTo = getParentNode(stylesheet)

    const wrapper = mount(
      <Changes branch='master'
               changes={state}
               commitAuthor={null}
               dispatcher={dispatcher!}
               emoji={emoji!}
               gitHubUsers={gitHubUsers!}
               repository={repository} />,
      { attachTo }
    )

    const changedFiles = wrapper.find(ChangedFile)
    expect(changedFiles.length).to.equal(4)

    changedFiles.forEach(f => {
      console.log('unchecking item')
      const checkbox = f.find('input[type="checkbox"]')
      if (checkbox) {
        const _checkbox = (checkbox as any).node
        console.log('before: checked= ' + _checkbox['checked'])
      }
      const after = checkbox.simulate('change', { currentTarget : { checked: false }})
      if (after) {
        const _after = (after as any).node
        console.log('after: checked= ' + _after['checked'])
      }
    })

    const commitMessage = wrapper.find(CommitMessage)
    const commitButton: any = commitMessage.find('.commit-button')
    const button = commitButton.node

    expect(button['disabled']).to.be.true
  })
})
