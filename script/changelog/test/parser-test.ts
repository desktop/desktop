import { expect } from 'chai'

import { findIssueRef, getReleaseNotesDescription } from '../parser'

describe('changelog/parser', () => {
  describe('findIssueRef', () => {
    it('detected fixes message at start of PR body', () => {
      const body = `
Fixes #2314

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).to.equal(' #2314')
    })

    it('detects multiple fixed issues in PR body', () => {
      const body = `
Fixes #2314
Fixes #1234

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).to.equal(' #2314 #1234')
    })

    it('handles colon after fixed message', () => {
      const body = `
Pellentesque pellentesque finibus fermentum. Aenean eget semper libero.

Fixes: #2314

Nam malesuada augue vel velit vehicula suscipit. Nunc posuere, velit at sodales
malesuada, quam tellus rutrum orci, et tincidunt sem nunc non velit. Cras
placerat, massa vel tristique iaculis, urna nisl tristique nibh, eget luctus
nisl quam in metus.`
      expect(findIssueRef(body)).to.equal(' #2314')
    })

    it('handles closes syntax', () => {
      const body = `
Closes: #2314

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).to.equal(' #2314')
    })

    it('handles resolves syntax', () => {
      const body = `This resolves #2314 and is totally wild`
      expect(findIssueRef(body)).to.equal(' #2314')
    })
  })

  describe('getReleaseNotesDescription', () => {
    it('defaults to PR title if not found', () => {
      const pr = {
        title: 'some title goes here',
        body: `lol didn't write words`,
      }
      const result = getReleaseNotesDescription(pr)
      expect(result.kind).to.equal('default')
      if (result.kind === 'default') {
        expect(result.text).to.equal('Some title goes here')
      }
    })

    it('finds no-notes input to indicate this should be omitted', () => {
      const pr = {
        title: 'some title goes here',
        body: `# Release notes

Notes: no-notes`,
      }
      const result = getReleaseNotesDescription(pr)
      expect(result.kind).to.equal('omitted')
    })

    it('finds release notes in body', () => {
      const pr = {
        title: 'some title goes here',
        body: `# Release notes

Notes: This Feature Fixes A Bug`,
      }
      const result = getReleaseNotesDescription(pr)
      expect(result.kind).to.equal('found')
      if (result.kind === 'found') {
        expect(result.text).to.equal('This Feature Fixes A Bug')
      }
    })
  })
})
