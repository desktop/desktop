import { expect } from 'chai'

import { findIssueRef } from '../parser'

describe('changelog/parser', () => {
  describe('findIssueRef', () => {
    it('detected closed message at start of PR body', () => {
      const body = `
Fixes #2314

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).to.equal(' #2314')
    })

    it('handles colon after message', () => {
      const body = `
Pellentesque pellentesque finibus fermentum. Aenean eget semper libero.

Fixes: #2314

Nam malesuada augue vel velit vehicula suscipit. Nunc posuere, velit at sodales
malesuada, quam tellus rutrum orci, et tincidunt sem nunc non velit. Cras
placerat, massa vel tristique iaculis, urna nisl tristique nibh, eget luctus
nisl quam in metus.`
      expect(findIssueRef(body)).to.equal(' #2314')
    })
  })
})
