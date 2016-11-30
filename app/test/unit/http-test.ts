import * as chai from 'chai'
const expect = chai.expect

import { getEncoding, getContentType, IHTTPResponse } from '../../src/lib/http'

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
    it('returns UTF-8 when not found', () => {
      const sampleResponse: IHTTPResponse = {
        headers: { },
      }

      const result = getEncoding(sampleResponse)
      expect(result).to.equal('utf-8')
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

    it('returns UTF-8 when omitted', () => {
      const sampleResponse: IHTTPResponse = {
        headers: {
          'content-type': [ 'text/html' ],
        },
      }

      const result = getEncoding(sampleResponse)
      expect(result).to.equal('utf-8')
    })
  })
})
