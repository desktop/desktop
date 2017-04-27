import * as chai from 'chai'
const expect = chai.expect

import { parsePorcelainStatus, IStatusEntry } from '../../src/lib/status-parser'

describe('parsePorcelainStatus', () => {
  it('parses a standard status', () => {

    const entries = parsePorcelainStatus([
      '1 .D N... 100644 100644 000000 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 deleted',
      '1 .M N... 100644 100644 100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 modified',
      '? added',
    ].join('\0') + '\0') as ReadonlyArray<IStatusEntry>

    expect(entries.length).to.equal(3)

    let i = 0
    expect(entries[i].statusCode).to.equal('.D')
    expect(entries[i].path).to.equal('deleted')

    expect(entries[i].statusCode).to.equal('.M')
    expect(entries[i].path).to.equal('modified')
    i++

    expect(entries[i].statusCode).to.equal('??')
    expect(entries[i].path).to.equal('untracked')
    i++
  })

  it('parses renames', () => {

    const entries = parsePorcelainStatus([
      '2 R. N... 100644 100644 100644 2de0487c2d3e977f5f560b746833f9d7f9a054fd 2de0487c2d3e977f5f560b746833f9d7f9a054fd R100 old\0new',
      '2 RM N... 100644 100644 100644 a3cba7afce66ef37a228e094273c27141db21f36 a3cba7afce66ef37a228e094273c27141db21f36 R100 to\0from'
    ].join('\0') + '\0') as ReadonlyArray<IStatusEntry>

    expect(entries.length).to.equal(2)

    let i = 0

    expect(entries[i].statusCode).to.equal('R.')
    expect(entries[i].path).to.equal('new')
    expect(entries[i].oldPath).to.equal('old')
    i++

    expect(entries[i].statusCode).to.equal('RM')
    expect(entries[i].path).to.equal('from')
    expect(entries[i].oldPath).to.equal('to')
  })
})
