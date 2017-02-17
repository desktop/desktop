import * as chai from 'chai'
const expect = chai.expect

import * as React from 'react'
import { shallow } from 'enzyme'

import { RichText } from '../../../src/ui/lib/rich-text'

describe('RichText', () => {

  const emoji = new Map<string, string>()

  describe('with GitHub repository', () => {
    it('renders hyperlink when a mention is found', () => {
      const linkClicked = () => { }
      const children = 'fixed based on suggestion from @shiftkey'

      const wrapper = shallow(
        <RichText emoji={emoji} children={children} linkClicked={linkClicked} />
      )

      const links = wrapper.find('.username')
      expect(links.length).to.equal(1)
    })
  })

  describe('with non-GitHub repository', () => {
    it('does not render hyperlinks', () => {
      const children = 'fixed based on suggestion from @shiftkey'

      const wrapper = shallow(
        <RichText emoji={emoji} children={children} />
      )

      const links = wrapper.find('.username')
      expect(links.length).to.equal(0)
    })
  })
})
