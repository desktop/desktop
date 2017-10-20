import { expect } from 'chai'

import { encodePath } from '../../src/lib/file-system'

describe('file-system', () => {
  describe('encodePath', () => {
    it('should encode hash symbol', () => {
      const dirName =
        'C:/Users/The Kong #2\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
      const uri = encodePath(dirName, 'index.html')
      expect(uri.startsWith('file://'))
      expect(uri.indexOf('%20') > 0)
      expect(uri.indexOf('%23') > 0)
    })
  })
})
