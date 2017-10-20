import { expect } from 'chai'

import { encodePathAsUrl } from '../../src/lib/path'

describe('path', () => {
  describe('encodePathAsUrl', () => {
    it('handles and already encoded path', () => {
      const dirName =
        'C:/Users/shift%20key%20\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
      const uri = encodePathAsUrl(dirName, 'index.html')
      expect(uri.startsWith('file://'))
      expect(uri.indexOf('%20')).is.greaterThan(0)
      expect(uri.indexOf('%2520')).is.equal(-1)
    })

    it('should encode hash symbol', () => {
      const dirName =
        'C:/Users/The Kong #2\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
      const uri = encodePathAsUrl(dirName, 'index.html')
      expect(uri.startsWith('file://'))

      expect(uri.indexOf('%23')).is.greaterThan(0)
    })
  })
})
