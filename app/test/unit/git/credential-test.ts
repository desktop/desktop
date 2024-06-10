import {
  formatCredential,
  parseCredential,
} from '../../../src/lib/git/credential'

describe('git/credential', () => {
  describe('parseCredential', () => {
    it('expands arrays into numeric entries', async () => {
      expect([
        ...parseCredential('wwwauth[]=foo\nwwwauth[]=bar').entries(),
      ]).toEqual([
        ['wwwauth[0]', 'foo'],
        ['wwwauth[1]', 'bar'],
      ])
    })
  })

  describe('formatCredential', () => {
    it('transforms numbered array entries into unnumbered', async () => {
      expect(
        formatCredential(
          new Map([
            ['wwwauth[0]', 'foo'],
            ['wwwauth[1]', 'bar'],
          ])
        )
      ).toBe('wwwauth[]=foo\nwwwauth[]=bar\n')
    })
  })
})
