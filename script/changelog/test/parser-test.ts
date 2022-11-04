import { findIssueRef, findReleaseNote } from '../parser'

describe('changelog/parser', () => {
  describe('findIssueRef', () => {
    it('detected fixes message at start of PR body', () => {
      const body = `
Fixes #2314

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).toBe(' #2314')
    })

    it('detects multiple fixed issues in PR body', () => {
      const body = `
Fixes #2314
Fixes #1234

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).toBe(' #2314 #1234')
    })

    it('handles colon after fixed message', () => {
      const body = `
Pellentesque pellentesque finibus fermentum. Aenean eget semper libero.

Fixes: #2314

Nam malesuada augue vel velit vehicula suscipit. Nunc posuere, velit at sodales
malesuada, quam tellus rutrum orci, et tincidunt sem nunc non velit. Cras
placerat, massa vel tristique iaculis, urna nisl tristique nibh, eget luctus
nisl quam in metus.`
      expect(findIssueRef(body)).toBe(' #2314')
    })

    it('handles closes syntax', () => {
      const body = `
Closes: #2314

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findIssueRef(body)).toBe(' #2314')
    })

    it('handles resolves syntax', () => {
      const body = `This resolves #2314 and is totally wild`
      expect(findIssueRef(body)).toBe(' #2314')
    })
  })

  describe('findReleaseNote', () => {
    it('detected release note at the end of the body', () => {
      const body = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.

Notes: [Fixed] Fix lorem impsum dolor sit amet
`
      expect(findReleaseNote(body)).toBe(
        '[Fixed] Fix lorem impsum dolor sit amet'
      )
    })

    it('removes dot at the end of release note', () => {
      const body = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.

Notes: [Fixed] Fix lorem impsum dolor sit amet.
`
      expect(findReleaseNote(body)).toBe(
        '[Fixed] Fix lorem impsum dolor sit amet'
      )
    })

    it('looks for the last Notes entry if there are several', () => {
      const body = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.
Notes: ignore this notes

Notes: These are valid notes
`
      expect(findReleaseNote(body)).toBe('These are valid notes')
    })

    it('detected no release notes wanted for the PR', () => {
      const body = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.

Notes: no-notes
`
      expect(findReleaseNote(body)).toBeNull()
    })

    it('detected no release notes were added to the PR', () => {
      const body = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer sollicitudin turpis
tempor euismod fermentum. Nullam hendrerit neque eget risus faucibus volutpat. Donec
ultrices, orci quis auctor ultrices, nulla lacus gravida lectus, non rutrum dolor
quam vel augue.`
      expect(findReleaseNote(body)).toBeUndefined()
    })
  })
})
