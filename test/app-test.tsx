import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import App from '../src/app'
import UsersStore from '../src/users-store'

describe('App', () => {
  it('renders', () => {
    const app = TestUtils.renderIntoDocument(<App usersStore={new UsersStore()}/>) as React.Component<any, any>
    const node = ReactDOM.findDOMNode(app)
    expect(node).not.to.equal(null)
  })
})
