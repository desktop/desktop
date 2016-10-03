import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import { App } from '../src/ui/app'
import { Dispatcher, AppStore, GitHubUserStore, CloningRepositoriesStore, EmojiStore } from '../src/lib/dispatcher'
import { InMemoryDispatcher } from './in-memory-dispatcher'
import { TestDatabase } from './test-github-user-database'

describe('App', () => {
  let appStore: AppStore | null = null
  let dispatcher: Dispatcher | null = null

  beforeEach(async () => {
    const db = new TestDatabase()
    await db.reset()

    appStore = new AppStore(new GitHubUserStore(db), new CloningRepositoriesStore(), new EmojiStore())

    dispatcher = new InMemoryDispatcher(appStore)
  })

  it('renders', () => {
    const app = TestUtils.renderIntoDocument(
      <App dispatcher={dispatcher!} appStore={appStore!}/>
    ) as React.Component<any, any>
    const node = ReactDOM.findDOMNode(app)
    expect(node).not.to.equal(null)
  })
})
