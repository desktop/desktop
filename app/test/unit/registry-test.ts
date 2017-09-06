import * as chai from 'chai'
const expect = chai.expect

import { readRegistryKeySafe } from '../../src/lib/registry'

if (process.platform === 'win32') {
  describe('registry', () => {
    describe('readRegistryKeySafe', () => {
      it('returns an empty array for an invalid key', async () => {
        const entries = await readRegistryKeySafe(
          'HKEY_LOCAL_MACHINE\\asgkahkgshakgashjgksahgkas'
        )
        expect(entries.length).to.equal(0)
      })

      it('returns an array for a known entry', async () => {
        const entries = await readRegistryKeySafe(
          'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate'
        )
        expect(entries.length).to.be.greaterThan(0)
      })
    })
  })
}
