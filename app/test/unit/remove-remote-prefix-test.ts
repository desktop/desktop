import { removeRemotePrefix } from '../../src/lib/remove-remote-prefix'

describe('removeRemotePrefix', () => {
  it('removes the remote prefix', () => {
    const name = removeRemotePrefix('origin/test')
    expect(name).toBe('test')
  })

  it(`removes only the remote prefix and not any subsequent /'s`, () => {
    const name = removeRemotePrefix('origin/test/name')
    expect(name).toBe('test/name')
  })

  it('returns null if there is no remote prefix', () => {
    const name = removeRemotePrefix('name')
    expect(name).toBeNull()
  })
})
