import {
  setBoolean,
  getBoolean,
  setNumber,
  getNumber,
} from '../../src/lib/local-storage'

describe('local storage', () => {
  const booleanKey = 'some-boolean-key'
  const numberKey = 'some-number-key'

  beforeEach(() => {
    localStorage.clear()
  })

  describe('setBoolean', () => {
    it('round-trips a true value', () => {
      const expected = true
      setBoolean(booleanKey, expected)
      expect(getBoolean(booleanKey)).toEqual(expected)
    })

    it('round-trips a false value', () => {
      const expected = false
      setBoolean(booleanKey, expected)
      expect(getBoolean(booleanKey)).toEqual(expected)
    })
  })

  describe('getBoolean parsing', () => {
    it('returns default value when malformed string encountered', () => {
      localStorage.setItem(booleanKey, 'blahblahblah')
      const defaultValue = true

      const actual = getBoolean(booleanKey, defaultValue)

      expect(actual).toEqual(defaultValue)
    })

    it('returns false if found and ignores default value', () => {
      localStorage.setItem(booleanKey, '0')

      const actual = getBoolean(booleanKey, true)

      expect(actual).toEqual(false)
    })

    it(`can parse the string 'true' if found`, () => {
      localStorage.setItem(booleanKey, 'true')

      const actual = getBoolean(booleanKey)

      expect(actual).toEqual(true)
    })

    it(`can parse the string 'false' if found`, () => {
      localStorage.setItem(booleanKey, 'false')
      const defaultValue = true

      const actual = getBoolean(booleanKey, defaultValue)

      expect(actual).toEqual(false)
    })
  })

  describe('setNumber', () => {
    it('round-trip a valid number', () => {
      const expected = 12345

      setNumber(numberKey, expected)

      expect(getNumber(numberKey)).toEqual(expected)
    })

    it('round-trip zero and ignore default value', () => {
      const expected = 0
      const defaultNumber = 1234

      setNumber(numberKey, expected)

      expect(getNumber(numberKey, defaultNumber)).toEqual(expected)
    })
  })

  describe('getNumber parsing', () => {
    it('returns default value when malformed string encountered', () => {
      localStorage.setItem(numberKey, 'blahblahblah')
      const defaultValue = 3456

      const actual = getNumber(numberKey, defaultValue)

      expect(actual).toEqual(defaultValue)
    })

    it('returns zero if found and ignores default value', () => {
      localStorage.setItem(numberKey, '0')
      const defaultValue = 3456

      const actual = getNumber(numberKey, defaultValue)

      expect(actual).toEqual(0)
    })
  })
})
