import * as chai from 'chai'
const expect = chai.expect

import { getContentType, IHTTPResponse } from '../../src/lib/http'

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
})
