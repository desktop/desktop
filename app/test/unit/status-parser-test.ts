/*
import * as chai from 'chai'
const expect = chai.expect

import { parsePorcelainStatus } from '../../src/lib/status-parser'

describe('parsePorcelainStatus', () => {
  it('parses a standard status', () => {

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
  })

  it('parses renames', () => {

    const entries = parsePorcelainStatus('R  new\0old\0RM from\0to\0')
    expect(entries.length).to.equal(2)

    let i = 0

    expect(entries[i].statusCode).to.equal('R ')
    expect(entries[i].path).to.equal('new')
    expect(entries[i].oldPath).to.equal('old')
    i++

    expect(entries[i].statusCode).to.equal('RM')
    expect(entries[i].path).to.equal('from')
    expect(entries[i].oldPath).to.equal('to')
  })
})
*/
