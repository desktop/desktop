import { describe, it } from 'node:test'
import assert from 'node:assert'
import { removeRemotePrefix } from '../../src/lib/remove-remote-prefix'

describe('removeRemotePrefix', () => {
  it('removes the remote prefix', () => {
    const name = removeRemotePrefix('origin/test')
    assert.equal(name, 'test')
  })

  it(`removes only the remote prefix and not any subsequent /'s`, () => {
    const name = removeRemotePrefix('origin/test/name')
    assert.equal(name, 'test/name')
  })

  it('returns null if there is no remote prefix', () => {
    const name = removeRemotePrefix('name')
    assert(name === null)
  })
})
