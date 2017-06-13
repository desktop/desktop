import { expect } from 'chai'
import { formatAsLocalRef } from '../../../src/lib/git/refs'

describe('git/refs', () => {
  it('formats the common branch syntax', () => {
    const result = formatAsLocalRef('master')
    expect(result).to.equal('refs/heads/master')
  })

  it('formats an explicit heads/ prefix', () => {
    const result = formatAsLocalRef('heads/something-important')
    expect(result).to.equal('refs/heads/something-important')
  })

  it('formats when a remote name is included', () => {
    const result = formatAsLocalRef('heads/Microsoft/master')
    expect(result).to.equal('refs/heads/Microsoft/master')
  })
})
