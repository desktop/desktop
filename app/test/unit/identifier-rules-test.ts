import { disallowedCharacters } from '../../src/ui/preferences/identifier-rules'

describe('Identifier rules', () => {
  it('returns any value that is a disallowed character', () => {
    expect(disallowedCharacters('.')).toBe('.')
    expect(disallowedCharacters(',')).toBe(',')
    expect(disallowedCharacters(':')).toBe(':')
    expect(disallowedCharacters(';')).toBe(';')
    expect(disallowedCharacters('<')).toBe('<')
    expect(disallowedCharacters('>')).toBe('>')
    expect(disallowedCharacters('"')).toBe('"')
    expect(disallowedCharacters('\\')).toBe('\\')
    expect(disallowedCharacters("'")).toBe("'")
    expect(disallowedCharacters(' ')).toBe(' ')
  })

  it('returns null when it receives an empty string', () => {
    expect(disallowedCharacters('')).toBeNull()
  })

  it('returns values that are for ascii character codes 0-32 inclusive', () => {
    for (let i = 0; i <= 32; i++) {
      const char = String.fromCharCode(i)
      expect(disallowedCharacters(char)).toBe(char)
    }
  })

  it('returns the value if it is a series of disallowed characters', () => {
    const disallowed = '.;:<>'
    expect(disallowedCharacters(disallowed)).toBe(disallowed)
  })

  it('returns null if the value consists of allowed characters', () => {
    const allowed = 'this is great'
    expect(disallowedCharacters(allowed)).toBeNull()
  })

  it('return null if the value contains allowed characters with disallowed characters', () => {
    const allowed = `;hi. there;${String.fromCharCode(31)}`
    expect(disallowedCharacters(allowed)).toBeNull()
  })

  it('returns null if the value contains ASCII characters whose code point is greater than 32', () => {
    const allowed = String.fromCharCode(33)
    expect(disallowedCharacters(allowed)).toBeNull()
  })
})
