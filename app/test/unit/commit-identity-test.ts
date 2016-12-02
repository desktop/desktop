import { expect, use as chaiUse } from 'chai'

chaiUse(require('chai-datetime'))

import { CommitIdentity } from '../../src/models/commit-identity'

describe('CommitIdentity', () => {
  describe('#parseIdent', () => {
    it('understands a normal ident string', () => {
      const identity = CommitIdentity.parseIdentity('Markus Olsson <markus@github.com> 1475670580 +0200')
      expect(identity).not.to.be.null

      expect(identity!.name).to.equal('Markus Olsson')
      expect(identity!.email).to.equal('markus@github.com')
      expect(identity!.date).to.equalTime(new Date('2016-10-05T12:29:40.000Z'))
    })

    it('parses timezone information', () => {
      const identity = CommitIdentity.parseIdentity('Markus Olsson <markus@github.com> 1475670580 +0100')

      expect(identity!.tzOffset).to.equal(60)
    })

    it('parses even if the email address isn\'t a normal email', () => {
      const identity = CommitIdentity.parseIdentity('Markus Olsson <Markus Olsson> 1475670580 +0200')
      expect(identity).not.to.be.null

      expect(identity!.name).to.equal('Markus Olsson')
      expect(identity!.email).to.equal('Markus Olsson')
    })
  })
})
