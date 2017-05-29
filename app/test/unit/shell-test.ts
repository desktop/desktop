import { expect } from 'chai'
import * as child_process from 'child_process'
import * as os from 'os'
import * as sinon from 'sinon'

import { shellNeedsPatching, getEnvironmentFromShell } from '../../src/lib/shell'

function setGlobalsForWin32() {
  const g: any = global
  g['__WIN32__'] = true
  g['__DARWIN__'] = false
}

function setGlobalsForDarwin() {
  const g: any = global
  g['__WIN32__'] = false
  g['__DARWIN__'] = true
}

function restoreGlobals() {
  const g: any = global
  g['__WIN32__'] = process.platform === 'win32'
  g['__DARWIN__'] = process.platform === 'darwin'
}

describe('shell', () => {
  describe('shellNeedsPatching', () => {

    const oldEnv = process.env
    const p: any = process

    beforeEach(() => {
      p._env = oldEnv
    })

    afterEach(() => {
      process.env = oldEnv
      delete p._env
    })

    it('returns false for Windows', () => {
      setGlobalsForWin32()
      expect(shellNeedsPatching(process)).to.be.false
    })

    it('returns false for macOS when it has a PWD', () => {
      setGlobalsForDarwin()
      process.env.PWD = __dirname
      expect(shellNeedsPatching(process)).to.be.false
    })

    it('returns true for macOS when it is missing a PWD', () => {
      setGlobalsForDarwin()
      delete process.env.PWD
      expect(shellNeedsPatching(process)).to.be.true
    })
  })

  describe('getEnvironmentFromShell', () => {
    let spawnSync: sinon.SinonStub | null = null

    beforeEach(() => {
      // setup for macOS as this is the only interesting environment
      setGlobalsForDarwin()
      spawnSync = sinon.stub(child_process, 'spawnSync')
    })

    afterEach(() => {
      restoreGlobals()
      spawnSync!.restore()
    })

    it('parses environment text into array', () => {
      spawnSync!.returns({
        stdout: 'FOO=BAR' + os.EOL +
                'TERM=xterm-something' + os.EOL +
                'PATH=/usr/bin:/bin:/usr/sbin:/sbin:/crazy/path',
      })

      const env = getEnvironmentFromShell()
      expect(env).to.not.be.null
      expect(env!.FOO).to.equal('BAR')
      expect(env!.TERM).to.equal('xterm-something')
      expect(env!.PATH).to.equal('/usr/bin:/bin:/usr/sbin:/sbin:/crazy/path')
    })

    it('returns null when an error occurs', () => {
      spawnSync!.returns({
        error: new Error('testing when an error occurs'),
      })

      const env = getEnvironmentFromShell()
      expect(env).to.be.null
    })
  })
})
