import * as chai from 'chai'
const expect = chai.expect

import { getActiveCodePage } from '../../src/lib/shell'
import { readRegistryKeySafe } from '../../src/lib/registry'

if (process.platform === 'win32') {
  describe('registry/readRegistryKeySafe', () => {
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

    it('cleans up changes to the active code page', async () => {
      const utf8CodePage = 65001

      const beforeCodePage = await getActiveCodePage()
      expect(beforeCodePage).to.not.equal(utf8CodePage)

      await readRegistryKeySafe(
        'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate'
      )
      const afterCodePage = await getActiveCodePage()

      expect(afterCodePage).to.not.equal(utf8CodePage)
      expect(afterCodePage).to.equal(beforeCodePage)
    })
  })
}
