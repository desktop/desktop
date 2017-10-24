import { expect } from 'chai'

import { encodePathAsUrl } from '../../src/lib/path'

describe('path', () => {
  describe('encodePathAsUrl', () => {
    if (__WIN32__) {
      it('normalizes path separators on Windows', () => {
        const dirName =
          'C:/Users/shiftkey\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
        const uri = encodePathAsUrl(dirName, 'folder/file.html')
        expect(uri.startsWith('file:///C:/Users/shiftkey/'))
      })
    }

    it('should encode hash symbol', () => {
      const dirName =
        'C:/Users/The Kong #2\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
      const uri = encodePathAsUrl(dirName, 'index.html')
      expect(uri.startsWith('file:///'))
      expect(uri.indexOf('%23')).is.greaterThan(0)
    })
  })
})
