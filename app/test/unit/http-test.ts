import * as chai from 'chai'
const expect = chai.expect

import { getEncoding, getContentType, IHTTPResponse, toQueryString } from '../../src/lib/http'

describe('HTTP', () => {
  describe('getContentType', () => {
    it('returns null when not found', () => {
      const sampleResponse: IHTTPResponse = {
        headers: { },
      }

      const result = getContentType(sampleResponse)
      expect(result).to.be.null
    })

    it('performs case-insensitive match', () => {
      const sentenceCasing: IHTTPResponse = {
        headers: {
          'Content-Type': [ 'text/html' ],
        },
      }
      const lowerCasing: IHTTPResponse = {
        headers: {
          'content-type': [ 'text/html' ],
        },
      }

      const first = getContentType(sentenceCasing)
      expect(first).to.equal('text/html')

      const second = getContentType(lowerCasing)
      expect(second).to.equal('text/html')
    })

    it('ignores parameters provided after', () => {
      const sampleResponse: IHTTPResponse = {
        headers: {
          'content-type': [ 'application/json; charset=utf-8' ],
        },
      }

      const result = getContentType(sampleResponse)
      expect(result).to.equal('application/json')
    })
  })

 describe('getEncoding', () => {
    it('returns null when not found', () => {
      const sampleResponse: IHTTPResponse = {
        headers: { },
      }

      const result = getEncoding(sampleResponse)
      expect(result).to.be.null
    })

    it('performs case-insensitive match', () => {
      const sentenceCasing: IHTTPResponse = {
        headers: {
          'Content-Type': [ 'text/html; charset=utf-16' ],
        },
      }
      const lowerCasing: IHTTPResponse = {
        headers: {
          'content-type': [ 'text/html; charset=utf-16' ],
        },
      }

      const first = getEncoding(sentenceCasing)
      expect(first).to.equal('utf-16')

      const second = getEncoding(lowerCasing)
      expect(second).to.equal('utf-16')
    })

    it('returns ISO-8859-1 when omitted for text/html', () => {
      const sampleResponse: IHTTPResponse = {
        headers: {
          'content-type': [ 'text/html' ],
        },
      }

      const result = getEncoding(sampleResponse)
      expect(result).to.equal('iso-8859-1')
    })

    it('returns UTF-8 when omitted for application/json', () => {
      const sampleResponse: IHTTPResponse = {
        headers: {
          'content-type': [ 'application/json' ],
        },
      }

      const result = getEncoding(sampleResponse)
      expect(result).to.equal('utf-8')
    })

    it('returns null when omitted for image/png', () => {
      const sampleResponse: IHTTPResponse = {
        headers: {
          'content-type': [ 'image/png' ],
        },
      }

      const result = getEncoding(sampleResponse)
      expect(result).to.be.null
    })
  })

  describe('toQueryString', () => {
    it('renders date value without URI encoding', () => {
      const params = {
        'since': new Date('2016-08-31T01:02:03Z'),
      }

      const result = toQueryString(params)
      expect(result).to.equal('?since=2016-08-31T01:02:03.000Z')
    })

    it('renders string value with encoding', () => {
      const params = {
        'something': 'ha ha business',
      }

      const result = toQueryString(params)
      expect(result).to.equal('?something=ha%20ha%20business')
    })
  })
})
