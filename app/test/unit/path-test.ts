import { encodePathAsUrl, resolveWithin } from '../../src/lib/path'
import { resolve, basename, join } from 'path'
import { promises } from 'fs'
import { tmpdir } from 'os'

const { rmdir, mkdtemp, symlink, unlink } = promises

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

    if (!__WIN32__) {
      it('fails for paths that use a symlink to traverse outside of the root', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'path-test'))
        const symlinkName = 'dangerzone'
        const symlinkPath = join(tempDir, symlinkName)

        try {
          await symlink(resolve(tempDir, '..', '..'), symlinkPath)
          expect(await resolveWithin(tempDir, symlinkName)).toBeNull()
        } finally {
          await unlink(symlinkPath)
          await rmdir(tempDir)
        }
      })

      it('succeeds for paths that use a symlink to traverse outside of the root and then back again', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'path-test'))
        const symlinkName = 'dangerzone'
        const symlinkPath = join(tempDir, symlinkName)

        try {
          await symlink(resolve(tempDir, '..', '..'), symlinkPath)
          const throughSymlinkPath = join(
            symlinkName,
            basename(resolve(tempDir, '..')),
            basename(tempDir)
          )
          expect(await resolveWithin(tempDir, throughSymlinkPath)).toBe(
            resolve(tempDir, throughSymlinkPath)
          )
        } finally {
          await unlink(symlinkPath)
          await rmdir(tempDir)
        }
      })
    }
  })
})
