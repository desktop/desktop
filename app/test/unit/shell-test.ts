import * as chai from 'chai'
const expect = chai.expect

import { getActiveCodePage } from '../../src/lib/shell'

describe('shell', () => {
  describe('getActiveCodePage', () => {
    it('can resolve the current code page on Windows', async () => {
      if (process.platform !== 'win32') {
        return
      }

      const codePage = await getActiveCodePage()
      expect(codePage).to.be.greaterThan(0)
    })

    it('returns null for non-Windows platforms', async () => {
      if (process.platform === 'win32') {
        return
      }
      const codePage = await getActiveCodePage()
      expect(codePage).to.be.null
    })
  })
})
