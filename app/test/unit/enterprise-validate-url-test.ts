import * as chai from 'chai'
const expect = chai.expect

import { validateURL, isValidText } from '../../src/ui/lib/enterprise-validate-url'

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
})

describe('isValidText', () => {
  it('expects some text', () => {
    expect(isValidText('')).to.be.false
  })

  it('fails for whitespace', () => {
    expect(isValidText('   ')).to.be.false
  })

  it('fails for words', () => {
    expect(isValidText('ha 123 words')).to.be.false
  })

  it('succeeds with a hostname', () => {
    expect(isValidText('myenterpriseserver')).to.be.true
  })

  it('succeeds with a URL', () => {
    expect(isValidText('https://myenterpriseserver/')).to.be.true
  })
})
