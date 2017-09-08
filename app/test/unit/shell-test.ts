import * as chai from 'chai'
const expect = chai.expect

import { getActiveCodePage } from '../../src/lib/shell'

describe('shell/getActiveCodePage', () => {
  if (process.platform === 'win32') {
    it('can resolve the current code page on Windows', async () => {
      const codePage = await getActiveCodePage()
      expect(codePage).to.be.greaterThan(0)
    })
  } else {
    it('returns null for non-Windows platforms', async () => {
      const codePage = await getActiveCodePage()
      expect(codePage).to.be.null
    })
  }
})
