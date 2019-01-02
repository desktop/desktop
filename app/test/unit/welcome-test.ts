import {
  hasShownWelcomeFlow,
  markWelcomeFlowComplete,
} from '../../src/lib/welcome'

describe('Welcome', () => {
  const key = 'has-shown-welcome-flow'

  describe('hasShownWelcomeFlow', () => {
    beforeEach(() => {
      localStorage.removeItem(key)
    })

    it('defaults to false when no value found', () => {
      expect(hasShownWelcomeFlow()).toBe(false)
    })

    it('returns false for some non-numeric value', () => {
      localStorage.setItem(key, 'a')
      expect(hasShownWelcomeFlow()).toBe(false)
    })

    it('returns false when zero found', () => {
      localStorage.setItem(key, '0')
      expect(hasShownWelcomeFlow()).toBe(false)
    })

    it('returns true when one found', () => {
      localStorage.setItem(key, '1')
      expect(hasShownWelcomeFlow()).toBe(true)
    })
  })

  describe('markWelcomeFlowComplete', () => {
    it('sets localStorage to 1', () => {
      markWelcomeFlowComplete()
      const value = localStorage.getItem(key)
      expect(value).toBe('1')
    })
  })
})
