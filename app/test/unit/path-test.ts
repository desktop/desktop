import { encodePathAsUrl, resolveWithin } from '../../src/lib/path'

describe('path', () => {
  describe('encodePathAsUrl', () => {
    if (__WIN32__) {
      it('normalizes path separators on Windows', () => {
        const dirName =
          'C:/Users/shiftkey\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
        const uri = encodePathAsUrl(dirName, 'folder/file.html')
        expect(uri.startsWith('file:///C:/Users/shiftkey/AppData/Local/'))
      })

      it('encodes spaces and hashes', () => {
        const dirName =
          'C:/Users/The Kong #2\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
        const uri = encodePathAsUrl(dirName, 'index.html')
        expect(uri.startsWith('file:///C:/Users/The%20Kong%20%232/'))
      })
    }

    if (__DARWIN__ || __LINUX__) {
      it('encodes spaces and hashes', () => {
        const dirName =
          '/Users/The Kong #2\\AppData\\Local\\GitHubDesktop\\app-1.0.4\\resources\\app'
        const uri = encodePathAsUrl(dirName, 'index.html')
        expect(uri.startsWith('file:////Users/The%20Kong%20%232/'))
      })
    }
  })

  describe('resolveWithin', () => {
    it('fails for paths outside of the root', () => {
      expect(resolveWithin('/foo/bar', '../')).toBeNull()
      expect(resolveWithin('/foo/bar', 'baz/../../bla')).toBeNull()
    })

    it('succeeds for paths that traverse out, and then back into, the root', () => {
      expect(resolveWithin('/foo/bar', '../bar')).toEqual('/foo/bar')
    })

    it('fails for paths containing null bytes', () => {
      expect(resolveWithin('/foo/bar', 'foo\0bar')).toBeNull()
    })

    it('succeeds for absolute relative paths as long as they stay within the root', () => {
      expect(resolveWithin('/foo/bar', '/foo/bar/baz')).toEqual('/foo/bar/baz')
    })
  })
})
