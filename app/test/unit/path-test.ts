import { encodePathAsUrl, resolveWithin } from '../../src/lib/path'
import { resolve, basename, join } from 'path'

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

  describe('resolveWithin', async () => {
    const root = process.cwd()

    it('fails for paths outside of the root', async () => {
      expect(await resolveWithin(root, join('..'))).toBeNull()
      expect(await resolveWithin(root, join('..', '..'))).toBeNull()
    })

    it('succeeds for paths that traverse out, and then back into, the root', async () => {
      expect(await resolveWithin(root, join('..', basename(root)))).toEqual(
        root
      )
    })

    it('fails for paths containing null bytes', async () => {
      expect(await resolveWithin(root, 'foo\0bar')).toBeNull()
    })

    it('succeeds for absolute relative paths as long as they stay within the root', async () => {
      const parent = resolve(root, '..')
      expect(await resolveWithin(parent, root)).toEqual(root)
    })
  })
})
