import { expect } from 'chai'

import { shellNeedsPatching } from '../../src/lib/shell'

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
      const g: any = global
      g['__WIN32__'] = true
      g['__DARWIN__'] = false
      expect(shellNeedsPatching(process)).to.be.false
    })

    it('returns false for macOS when it has a PWD', () => {
      const g: any = global
      g['__WIN32__'] = false
      g['__DARWIN__'] = true

      process.env.PWD = __dirname
      expect(shellNeedsPatching(process)).to.be.false
    })

    it('returns true for macOS when it is missing a PWD', () => {
      const g: any = global
      g['__WIN32__'] = false
      g['__DARWIN__'] = true

      delete process.env.PWD
      expect(shellNeedsPatching(process)).to.be.true
    })
  })
})
