import {
  setBoolean,
  getBoolean,
  setNumber,
  getNumber,
} from '../../src/lib/local-storage'

describe('local storage', () => {
  describe('working with booleans', () => {
    const key = 'some-boolean-key'

    it('can round-trip a true value', () => {
      const expected = true

      setBoolean(key, expected)

      expect(getBoolean(key)).toEqual(expected)
    })

    it('returns default value when malformed string encountered', () => {
      localStorage.setItem(key, 'blahblahblah')
      const defaultValue = true

      const actual = getBoolean(key, defaultValue)

      expect(actual).toEqual(defaultValue)
    })
  })

  describe('working with numbers', () => {
    const key = 'some-number-key'

    it('can round-trip a true value', () => {
      const expected = 12345

      setNumber(key, expected)

      expect(getNumber(key)).toEqual(expected)
    })

    it('returns default value when malformed string encountered', () => {
      localStorage.setItem(key, 'blahblahblah')
      const defaultValue = 3456

      const actual = getNumber(key, defaultValue)

      expect(actual).toEqual(defaultValue)
    })
  })
})
