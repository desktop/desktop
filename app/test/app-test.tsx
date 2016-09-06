import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import App from '../src/ui/app'
import { Dispatcher, AppStore } from '../src/lib/dispatcher'
import InMemoryDispatcher from './in-memory-dispatcher'

describe('App', () => {
  let appStore: AppStore | null = null
  let dispatcher: Dispatcher | null = null

  beforeEach(async () => {
    appStore = new AppStore()

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
