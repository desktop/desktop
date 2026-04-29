import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isWSLPath,
  getWSLDistroName,
  wslUNCToPosixPath,
} from '../../src/lib/is-wsl-path'

describe('is-wsl-path', () => {
  describe('isWSLPath', () => {
    it('detects \\\\wsl$\\distro paths', () => {
      assert.equal(isWSLPath('\\\\wsl$\\Ubuntu\\home\\user\\repo'), true)
    })

    it('detects \\\\wsl.localhost\\distro paths', () => {
      assert.equal(
        isWSLPath('\\\\wsl.localhost\\Ubuntu\\home\\user\\repo'),
        true
      )
    })

    it('detects forward-slash variants', () => {
      assert.equal(isWSLPath('//wsl$/Ubuntu/home/user/repo'), true)
      assert.equal(isWSLPath('//wsl.localhost/Ubuntu/home/user'), true)
    })

    it('is case-insensitive', () => {
      assert.equal(isWSLPath('\\\\WSL$\\Ubuntu\\home'), true)
      assert.equal(isWSLPath('\\\\WSL.LOCALHOST\\Ubuntu\\home'), true)
    })

    it('rejects normal Windows paths', () => {
      assert.equal(isWSLPath('C:\\Users\\user\\repo'), false)
    })

    it('rejects Linux paths', () => {
      assert.equal(isWSLPath('/home/user/repo'), false)
    })

    it('rejects network shares that are not WSL', () => {
      assert.equal(isWSLPath('\\\\server\\share\\path'), false)
    })

    it('rejects empty string', () => {
      assert.equal(isWSLPath(''), false)
    })
  })

  describe('getWSLDistroName', () => {
    it('extracts distro from wsl$ path', () => {
      assert.equal(
        getWSLDistroName('\\\\wsl$\\Ubuntu-24.04\\home\\user'),
        'Ubuntu-24.04'
      )
    })

    it('extracts distro from wsl.localhost path', () => {
      assert.equal(
        getWSLDistroName('\\\\wsl.localhost\\Debian\\home'),
        'Debian'
      )
    })

    it('extracts distro from forward-slash path', () => {
      assert.equal(getWSLDistroName('//wsl$/Arch/home'), 'Arch')
    })

    it('returns null for non-WSL paths', () => {
      assert.equal(getWSLDistroName('C:\\Users\\user'), null)
    })
  })

  describe('wslUNCToPosixPath', () => {
    it('converts backslash UNC path to posix', () => {
      assert.equal(
        wslUNCToPosixPath('\\\\wsl$\\Ubuntu\\home\\user\\repo'),
        '/home/user/repo'
      )
    })

    it('converts forward-slash UNC path to posix', () => {
      assert.equal(
        wslUNCToPosixPath('//wsl.localhost/Ubuntu/home/user/repo'),
        '/home/user/repo'
      )
    })

    it('handles distro-only path (no remainder)', () => {
      assert.equal(wslUNCToPosixPath('\\\\wsl$\\Ubuntu'), '/')
    })

    it('handles distro with trailing slash only', () => {
      assert.equal(wslUNCToPosixPath('\\\\wsl$\\Ubuntu\\'), '/')
    })

    it('returns null for non-WSL paths', () => {
      assert.equal(wslUNCToPosixPath('C:\\Users\\user'), null)
    })
  })
})
