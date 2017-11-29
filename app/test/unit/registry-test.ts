import { expect } from 'chai'

import { readRegistryKeySafe } from '../../src/lib/registry'

if (process.platform === 'win32') {
  describe('registry/readRegistryKeySafe', () => {
    it('returns an empty array for an invalid key', async () => {
      const entries = await readRegistryKeySafe(
        'HKLM:\\asgkahkgshakgashjgksahgkas'
      )
      expect(entries.length).to.equal(0)
    })

    it('returns an array for a known entry', async () => {
      const entries = await readRegistryKeySafe(
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate'
      )
      expect(entries.length).to.be.greaterThan(0)
    })
  })
}
