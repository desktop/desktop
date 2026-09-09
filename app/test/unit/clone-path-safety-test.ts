import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as Path from 'path'
import {
  parseRepositoryIdentifier,
  sanitizeCloneName,
} from '../../src/lib/remote-parsing'

describe('sanitizeCloneName', () => {
  it('returns a simple name unchanged', () => {
    assert.equal(sanitizeCloneName('Hello-World'), 'Hello-World')
  })

  it('extracts last component from backslash-separated traversal', () => {
    assert.equal(sanitizeCloneName('x..\\..\\..\\..\\foo'), 'foo')
  })

  it('rejects names that resolve to .. or empty', () => {
    assert.equal(sanitizeCloneName('..'), null)
    assert.equal(sanitizeCloneName(''), null)
    assert.equal(sanitizeCloneName('.git'), null)
  })

  it('does not traverse from default basepath (#x\\..\\..\\..\\.ssh)', () => {
    assert.equal(sanitizeCloneName('x..\\..\\..\\../.ssh'), '.ssh')
  })
})

describe('clone path derivation with sanitizeCloneName', () => {
  it('normal URLs are unchanged after sanitization', () => {
    const urls = [
      'https://github.com/octocat/Hello-World.git',
      'git@github.com:octocat/Hello-World.git',
      'octocat/Hello-World',
    ]
    for (const url of urls) {
      const result = parseRepositoryIdentifier(url)
      assert(result !== null, `Failed to parse: ${url}`)
      assert.equal(sanitizeCloneName(result.name), 'Hello-World')
    }
  })

  it('traversal payload clone path stays contained (POSIX)', () => {
    const result = parseRepositoryIdentifier(
      'https://evil.com/owner/x..\\..\\..\\.\\.ssh.git'
    )
    assert(result !== null)
    const safeName = sanitizeCloneName(result.name)
    assert(safeName !== null)
    const baseDir = '/Users/victim/Documents/GitHub'
    const resolved = Path.resolve(Path.join(baseDir, safeName))
    assert(
      resolved.startsWith(Path.resolve(baseDir)),
      `Clone path "${resolved}" escapes base dir`
    )
  })

  it('traversal payload clone path stays contained (Windows)', () => {
    const result = parseRepositoryIdentifier(
      'https://evil.com/owner/x..\\..\\..\\.\\.ssh.git'
    )
    assert(result !== null)
    const safeName = sanitizeCloneName(result.name)
    assert(safeName !== null)
    const baseDir = 'C:\\Users\\victim\\Documents\\GitHub'
    const resolved = Path.win32.resolve(Path.win32.join(baseDir, safeName))
    assert(
      resolved.startsWith(Path.win32.resolve(baseDir)),
      `Clone path "${resolved}" escapes base dir on Windows`
    )
  })
})
