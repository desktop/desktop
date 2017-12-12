import { expect } from 'chai'

import { parseReleaseEntries } from '../../src/lib/release-notes'

describe('release-notes', () => {
  describe('parseReleaseEntries', () => {
    const values = ['[fixed] something else']

    const result = parseReleaseEntries(values)

    expect(result.length).to.equal(1)
    expect(result[0].kind).to.equal('fixed')
    expect(result[0].message).to.equal('something else')
  })
})
