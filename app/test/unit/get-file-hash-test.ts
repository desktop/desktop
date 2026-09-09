import { describe, it } from 'node:test'
import assert from 'node:assert'
import { writeFile, rm, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import * as path from 'path'
import { getFileHash } from '../../src/lib/get-file-hash'

describe('get-file-hash', () => {
  it('returns consistent sha256 hash for known content', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hash-test-'))
    const filePath = path.join(dir, 'test-file.js')

    await writeFile(filePath, 'hello world')

    const hash = await getFileHash(filePath, 'sha256')

    // SHA-256 of "hello world"
    assert.strictEqual(
      hash,
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )

    await rm(dir, { recursive: true })
  })

  it('returns different hashes for different content', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hash-test-'))
    const file1 = path.join(dir, 'file1.js')
    const file2 = path.join(dir, 'file2.js')

    await writeFile(file1, 'original content')
    await writeFile(file2, 'modified content')

    const hash1 = await getFileHash(file1, 'sha256')
    const hash2 = await getFileHash(file2, 'sha256')

    assert.notStrictEqual(hash1, hash2)

    await rm(dir, { recursive: true })
  })

  it('returns same hash for same content in different files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hash-test-'))
    const file1 = path.join(dir, 'file1.js')
    const file2 = path.join(dir, 'file2.js')

    await writeFile(file1, 'identical content')
    await writeFile(file2, 'identical content')

    const hash1 = await getFileHash(file1, 'sha256')
    const hash2 = await getFileHash(file2, 'sha256')

    assert.strictEqual(hash1, hash2)

    await rm(dir, { recursive: true })
  })

  it('rejects for non-existent file', async () => {
    await assert.rejects(getFileHash('/nonexistent/path/file.js', 'sha256'), {
      code: 'ENOENT',
    })
  })

  it('supports sha1 algorithm', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hash-test-'))
    const filePath = path.join(dir, 'test-file.js')

    await writeFile(filePath, 'hello world')

    const hash = await getFileHash(filePath, 'sha1')

    // SHA-1 of "hello world"
    assert.strictEqual(hash, '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed')

    await rm(dir, { recursive: true })
  })
})
