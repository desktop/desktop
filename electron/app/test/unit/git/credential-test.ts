import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  formatCredential,
  parseCredential,
} from '../../../src/lib/git/credential'

describe('git/credential', () => {
  describe('parseCredential', () => {
    it('expands arrays into numeric entries', async () => {
      assert.deepStrictEqual(
        [...parseCredential('wwwauth[]=foo\nwwwauth[]=bar').entries()],
        [
          ['wwwauth[0]', 'foo'],
          ['wwwauth[1]', 'bar'],
        ]
      )
    })
  })

  describe('formatCredential', () => {
    it('transforms numbered array entries into unnumbered', async () => {
      assert.deepStrictEqual(
        formatCredential(
          new Map([
            ['wwwauth[0]', 'foo'],
            ['wwwauth[1]', 'bar'],
          ])
        ),
        'wwwauth[]=foo\nwwwauth[]=bar\n'
      )
    })
  })
})
