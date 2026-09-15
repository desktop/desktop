import { describe, it } from 'node:test'
import assert from 'node:assert'
import { CommitIdentity } from '../../src/models/commit-identity'

describe('CommitIdentity', () => {
  describe('#parseIdent', () => {
    it('understands a normal ident string', () => {
      const identity = CommitIdentity.parseIdentity(
        'Markus Olsson <markus@github.com> 1475670580 +0200'
      )
      assert.equal(identity.name, 'Markus Olsson')
      assert.equal(identity.email, 'markus@github.com')
      assert.deepStrictEqual(
        identity.date,
        new Date('2016-10-05T12:29:40.000Z')
      )
    })

    it('parses timezone information', () => {
      const identity1 = CommitIdentity.parseIdentity(
        'Markus Olsson <markus@github.com> 1475670580 +0130'
      )
      assert.equal(identity1.tzOffset, 90)

      const identity2 = CommitIdentity.parseIdentity(
        'Markus Olsson <markus@github.com> 1475670580 -0245'
      )
      assert.equal(identity2.tzOffset, -165)
    })

    it("parses even if the email address isn't a normal email", () => {
      const identity = CommitIdentity.parseIdentity(
        'Markus Olsson <Markus Olsson> 1475670580 +0200'
      )
      assert.equal(identity.name, 'Markus Olsson')
      assert.equal(identity.email, 'Markus Olsson')
    })

    it('parses even if the email address is broken', () => {
      // https://github.com/git/git/blob/3ef7618e616e023cf04180e30d77c9fa5310f964/ident.c#L292-L296
      const identity = CommitIdentity.parseIdentity(
        'Markus Olsson <Markus >Olsson> 1475670580 +0200'
      )
      assert.equal(identity.name, 'Markus Olsson')
      assert.equal(identity.email, 'Markus >Olsson')
    })
  })
})
