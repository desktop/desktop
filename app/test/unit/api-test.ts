import * as chai from 'chai'
const expect = chai.expect

import { toCamelCase } from '../../src/lib/api'

describe('API', () => {
  describe('toCamelCase', () => {
    it('converts keys to camel case', () => {
      const sampleResponse = {
        'verifiable_password_authentication': true,
        'services_sha': 'deadbeef',
      }
      const expected = {
        verifiablePasswordAuthentication: true,
        servicesSha: 'deadbeef',
      }
      const result = toCamelCase(sampleResponse)

      expect(result.verifiablePasswordAuthentication).to.equal(expected.verifiablePasswordAuthentication)
      expect(result.servicesSha).to.equal(expected.servicesSha)
    })
  })
})
