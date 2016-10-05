import * as chai from 'chai'
const expect = chai.expect

import { CommitIdentity } from '../../src/models/commit-identity'

describe('CommitIdentity', () => {
  describe('#parseIdent', () => {
    it('understands a normal ident string', () => {
      const identity = CommitIdentity.parseIdent('Markus Olsson <markus@github.com> 1475670580 +0200')
      expect(identity).not.to.be.null

      expect(identity!.name).to.equal('Markus Olsson')
      expect(identity!.email).to.equal('markus@github.com')
    })

    it('parses even if the email address isn\'t a normal email', () => {
      const identity = CommitIdentity.parseIdent('Markus Olsson <Markus Olsson> 1475670580 +0200')
      expect(identity).not.to.be.null

      expect(identity!.name).to.equal('Markus Olsson')
      expect(identity!.email).to.equal('Markus Olsson')
    })
  })
})
