import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import { shallow } from 'enzyme'

import { RichText } from '../../../src/ui/lib/rich-text'

describe('RichText', () => {
  it('renders a hyperlink when the mention is found', () => {
    const emoji = new Map<string, string>()
    const children = 'fixed based on suggestion from @shiftkey'
    const linkClicked = () => { }

    const wrapper = shallow(
      <RichText emoji={emoji} children={children} linkClicked={linkClicked} />
    )

    const links = wrapper.find('.username')
    expect(links.length).to.equal(1)
  })
})
