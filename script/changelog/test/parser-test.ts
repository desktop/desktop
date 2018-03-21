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

    it('detects multiple issues when linked', () => {
      const body = `
Fixes #2314
Fixes #1234

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).to.equal(' #2314 #1234')
    })
  })
})
