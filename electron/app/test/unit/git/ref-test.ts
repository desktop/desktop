import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatAsLocalRef, getSymbolicRef } from '../../../src/lib/git/refs'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('git/refs', () => {
  describe('formatAsLocalRef', () => {
    it('formats the common branch syntax', () => {
      const result = formatAsLocalRef('master')
      assert.equal(result, 'refs/heads/master')
    })

    it('formats an explicit heads/ prefix', () => {
      const result = formatAsLocalRef('heads/something-important')
      assert.equal(result, 'refs/heads/something-important')
    })

    it('formats when a remote name is included', () => {
      const result = formatAsLocalRef('heads/Microsoft/master')
      assert.equal(result, 'refs/heads/Microsoft/master')
    })
  })

  describe('getSymbolicRef', () => {
    it('resolves a valid symbolic ref', async t => {
      const repo = await setupEmptyRepository(t)
      const ref = await getSymbolicRef(repo, 'HEAD')
      assert.equal(ref, 'refs/heads/master')
    })

    it('does not resolve a missing ref', async t => {
      const repo = await setupEmptyRepository(t)
      const ref = await getSymbolicRef(repo, 'FOO')
      assert(ref === null)
    })
  })
})
