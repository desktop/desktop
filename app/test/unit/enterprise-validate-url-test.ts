import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateURL } from '../../src/ui/lib/enterprise-validate-url'

describe('validateURL', () => {
  it('passes through a valid url', () => {
    const url = 'https://ghe.io:9000'
    const result = validateURL(url)
    assert.equal(result, url)
  })

  it('prepends https if no protocol is provided', () => {
    const url = validateURL('ghe.io')
    assert.equal(url, 'https://ghe.io')
  })

  it('throws if given an invalid protocol', () => {
    assert.throws(() => validateURL('ftp://ghe.io'))
  })

  it('throws if given whitespace', () => {
    assert.throws(() => validateURL('    '))
  })

  it('handles whitespace alongside valid text', () => {
    const url = validateURL('ghe.io   ')
    assert.equal(url, 'https://ghe.io')
  })
})
