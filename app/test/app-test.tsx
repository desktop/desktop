import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import App from '../src/ui/app'
import { Dispatcher, AppStore, GitUserStore } from '../src/lib/dispatcher'
import InMemoryDispatcher from './in-memory-dispatcher'
import TestGitUserDatabase from './test-git-user-database'

describe('App', () => {
  let store: AppStore | null = null
  let gitUserStore: GitUserStore | null = null
  let dispatcher: Dispatcher | null = null

  beforeEach(async () => {
    store = new AppStore()

    const db = new TestGitUserDatabase()
    await db.reset()

    gitUserStore = new GitUserStore(db)
    dispatcher = new InMemoryDispatcher(store, gitUserStore)
  })

  it('renders', () => {
    const app = TestUtils.renderIntoDocument(<App dispatcher={dispatcher!} store={store!} gitUserStore={gitUserStore!}/>) as React.Component<any, any>
    const node = ReactDOM.findDOMNode(app)
    expect(node).not.to.equal(null)
  })
})
