import { gitAuthorNameIsValid } from '../../src/ui/lib/identifier-rules'

describe('Identifier rules', () => {
  describe('gitAuthorNameIsValid', () => {
    it('returns any value that is a disallowed character', () => {
      expect(gitAuthorNameIsValid('.')).toBeFalse()
      expect(gitAuthorNameIsValid(',')).toBeFalse()
      expect(gitAuthorNameIsValid(':')).toBeFalse()
      expect(gitAuthorNameIsValid(';')).toBeFalse()
      expect(gitAuthorNameIsValid('<')).toBeFalse()
      expect(gitAuthorNameIsValid('>')).toBeFalse()
      expect(gitAuthorNameIsValid('"')).toBeFalse()
      expect(gitAuthorNameIsValid('\\')).toBeFalse()
      expect(gitAuthorNameIsValid("'")).toBeFalse()
      expect(gitAuthorNameIsValid(' ')).toBeFalse()
    })

    it('returns true for empty strings', () => {
      expect(gitAuthorNameIsValid('')).toBeTrue()
    })

    it('returns false when name consists only of ascii character codes 0-32 inclusive', () => {
      for (let i = 0; i <= 32; i++) {
        const char = String.fromCharCode(i)
        expect(gitAuthorNameIsValid(char)).toBeFalse()
      }
    })

    it('returns false when name consists solely of disallowed characters', () => {
      expect(gitAuthorNameIsValid('.;:<>')).toBeFalse()
    })

    it('returns true if the value consists of allowed characters', () => {
      expect(gitAuthorNameIsValid('this is great')).toBeTrue()
    })

    it('returns true if the value contains allowed characters with disallowed characters', () => {
      const allowed = `;hi. there;${String.fromCharCode(31)}`
      expect(gitAuthorNameIsValid(allowed)).toBeTrue()
    })

    it('returns true if the value contains ASCII characters whose code point is greater than 32', () => {
      const allowed = String.fromCharCode(33)
      expect(gitAuthorNameIsValid(allowed)).toBeTrue()
    })
  })
})
