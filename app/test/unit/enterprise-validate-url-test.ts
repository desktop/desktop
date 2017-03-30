import * as chai from 'chai'
const expect = chai.expect

import { validateURL } from '../../src/ui/lib/enterprise-validate-url'

describe('validateURL', () => {
  it('passes through a valid url', () => {
    const url = 'https://ghe.io:9000'
    const result = validateURL(url)
    expect(result).to.equal(url)
  })

  it('prepends https if no protocol is provided', () => {
    const url = validateURL('ghe.io')
    expect(url).to.equal('https://ghe.io')
  })

  it('throws if given an invalid protocol', () => {
    expect(() => validateURL('ftp://ghe.io')).to.throw()
  })

  it('throws if given whitespace', () => {
    expect(() => validateURL('    ')).to.throw()
  })

  it('handles whitespace alongside valid text', () => {
    const url = validateURL('ghe.io   ')
    expect(url).to.equal('https://ghe.io')
  })
})
