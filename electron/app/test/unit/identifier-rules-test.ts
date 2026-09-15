import { describe, it } from 'node:test'
import assert from 'node:assert'
import { gitAuthorNameIsValid } from '../../src/ui/lib/identifier-rules'

describe('Identifier rules', () => {
  describe('gitAuthorNameIsValid', () => {
    it('returns any value that is a disallowed character', () => {
      assert(!gitAuthorNameIsValid('.'))
      assert(!gitAuthorNameIsValid(','))
      assert(!gitAuthorNameIsValid(':'))
      assert(!gitAuthorNameIsValid(';'))
      assert(!gitAuthorNameIsValid('<'))
      assert(!gitAuthorNameIsValid('>'))
      assert(!gitAuthorNameIsValid('"'))
      assert(!gitAuthorNameIsValid('\\'))
      assert(!gitAuthorNameIsValid("'"))
      assert(!gitAuthorNameIsValid(' '))
    })

    it('returns true for empty strings', () => {
      assert(gitAuthorNameIsValid(''))
    })

    it('returns false when name consists only of ascii character codes 0-32 inclusive', () => {
      for (let i = 0; i <= 32; i++) {
        const char = String.fromCharCode(i)
        assert(!gitAuthorNameIsValid(char))
      }
    })

    it('returns false when name consists solely of disallowed characters', () => {
      assert(!gitAuthorNameIsValid('.;:<>'))
    })

    it('returns true if the value consists of allowed characters', () => {
      assert(gitAuthorNameIsValid('this is great'))
    })

    it('returns true if the value contains allowed characters with disallowed characters', () => {
      const allowed = `;hi. there;${String.fromCharCode(31)}`
      assert(gitAuthorNameIsValid(allowed))
    })

    it('returns true if the value contains ASCII characters whose code point is greater than 32', () => {
      const allowed = String.fromCharCode(33)
      assert(gitAuthorNameIsValid(allowed))
    })
  })
})
