import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-addons-test-utils'

import { RichText } from '../../../src/ui/lib/rich-text'

describe('RichText', () => {
  it('renders a hyperlink when the mention is found', () => {
    const emoji = new Map<string, string>()
    const children = 'fixed based on suggestion from @shiftkey'
    const linkClicked = () => { }

    const text = TestUtils.renderIntoDocument(
      <RichText emoji={emoji} children={children} linkClicked={linkClicked} />
    ) as React.Component<any, any>
    const node = ReactDOM.findDOMNode(text)
    expect(node).not.to.equal(null)

    // TODO: find the user element inside the child nodes
  })
})
