import { formatAsLocalRef, getSymbolicRef } from '../../../src/lib/git/refs'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('git/refs', () => {
  describe('formatAsLocalRef', () => {
    it('formats the common branch syntax', () => {
      const result = formatAsLocalRef('master')
      expect(result).toBe('refs/heads/master')
    })

    it('formats an explicit heads/ prefix', () => {
      const result = formatAsLocalRef('heads/something-important')
      expect(result).toBe('refs/heads/something-important')
    })

    it('formats when a remote name is included', () => {
      const result = formatAsLocalRef('heads/Microsoft/master')
      expect(result).toBe('refs/heads/Microsoft/master')
    })
  })

  describe('getSymbolicRef', () => {
    it('resolves a valid symbolic ref', async () => {
      const repo = await setupEmptyRepository()
      const ref = await getSymbolicRef(repo, 'HEAD')
      expect(ref).toBe('refs/heads/master')
    })

    it('does not resolve a missing ref', async () => {
      const repo = await setupEmptyRepository()
      const ref = await getSymbolicRef(repo, 'FOO')
      expect(ref).toBeNull
    })
  })
})
