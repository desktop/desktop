import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import App from '../src/app'
import UsersStore from '../src/users-store'
import InMemoryStore from './in-memory-store'

describe('App', () => {
  let usersStore: UsersStore = null

  beforeEach(() => {
    const inMemoryStore = new InMemoryStore()
    usersStore = new UsersStore(inMemoryStore, inMemoryStore)
  })

  it('renders', () => {
    const app = TestUtils.renderIntoDocument(<App usersStore={usersStore}/>) as React.Component<any, any>
    const node = ReactDOM.findDOMNode(app)
    expect(node).not.to.equal(null)
  })
})
