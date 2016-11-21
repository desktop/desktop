import * as chai from 'chai'
const expect = chai.expect

import { toCamelCase } from '../../src/lib/api'

describe('API', () => {
  describe('toCamelCase', () => {
    it('converts keys to camel case', () => {
      const sampleResponse = {
        'verifiable_password_authentication': true,
        'github_services_sha': 'deadbeef',
        'hooks': [
          '127.0.0.1/32',
        ],
      }
      const expected = {
        verifiablePasswordAuthentication: true,
        githubServicesSha: 'deadbeef',
        hooks: [
          '127.0.0.1/32',
        ],
      }
      const result = toCamelCase(sampleResponse)

      expect(result.verifiablePasswordAuthentication).to.equal(expected.verifiablePasswordAuthentication)
      expect(result.githubServicesSha).to.equal(expected.githubServicesSha)
      expect(result.hooks[0]).to.equal(expected.hooks[0])
    })
  })
})
