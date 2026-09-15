import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getTempFilePath, readPartialFile } from '../../src/lib/file-system'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import * as path from 'path'
import { createTempDirectory } from '../helpers/temp'

describe('file-system', () => {
  describe('getTempFilePath', () => {
    it('returns a path in the temp directory', () => {
      const result = getTempFilePath('test-file')
      assert.ok(result.startsWith(tmpdir()))
    })

    it('includes the given name in the path', () => {
      const result = getTempFilePath('my-temp-file')
      assert.ok(result.includes('my-temp-file'))
    })

    it('generates unique paths on each call', () => {
      const a = getTempFilePath('test')
      const b = getTempFilePath('test')
      assert.notEqual(a, b)
    })
  })

  describe('readPartialFile', () => {
    it('reads a specific range from a file', async t => {
      const tempDir = await createTempDirectory(t)
      const filePath = path.join(tempDir, 'partial-read-test')
      await writeFile(filePath, 'Hello, World!', 'utf8')

      const result = await readPartialFile(filePath, 0, 4)
      assert.equal(result.toString(), 'Hello')
    })

    it('reads from the middle of a file', async t => {
      const tempDir = await createTempDirectory(t)
      const filePath = path.join(tempDir, 'partial-read-test-mid')
      await writeFile(filePath, 'abcdefghij', 'utf8')

      const result = await readPartialFile(filePath, 3, 6)
      assert.equal(result.toString(), 'defg')
    })

    it('reads a single byte', async t => {
      const tempDir = await createTempDirectory(t)
      const filePath = path.join(tempDir, 'partial-read-single')
      await writeFile(filePath, 'X', 'utf8')

      const result = await readPartialFile(filePath, 0, 0)
      assert.equal(result.toString(), 'X')
    })
  })
})
