import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import App from '../src/ui/app'
import {Dispatcher, LocalStore} from '../src/lib/dispatcher'
import InMemoryDispatcher from './in-memory-dispatcher'

describe('App', () => {
  let store: LocalStore | null = null
  let dispatcher: Dispatcher | null = null

  beforeEach(() => {
    store = new LocalStore()
    dispatcher = new InMemoryDispatcher(store)
  })

  it('renders', () => {
    const app = TestUtils.renderIntoDocument(<App dispatcher={dispatcher!} store={store!}/>) as React.Component<any, any>
    const node = ReactDOM.findDOMNode(app)
    expect(node).not.to.equal(null)
  })
})
