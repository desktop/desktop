import * as chai from 'chai'
const expect = chai.expect

import { parsePorcelainStatus } from '../../src/lib/status-parser'

describe('parsePorcelainStatus', () => {
  describe('name', () => {
    it('parses a standard status', async () => {

      const entries = parsePorcelainStatus(' M modified\0?? untracked\0 D deleted\0')
      expect(entries.length).to.equal(3)

      let i = 0

      expect(entries[i].statusCode).to.equal(' M')
      expect(entries[i].path).to.equal('modified')
      i++

      expect(entries[i].statusCode).to.equal('??')
      expect(entries[i].path).to.equal('untracked')
      i++

      expect(entries[i].statusCode).to.equal(' D')
      expect(entries[i].path).to.equal('deleted')
      i++
    })
  })
})
