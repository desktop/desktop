import { getAbsoluteUrl } from '../../src/lib/http'
import { getDotComAPIEndpoint } from '../../src/lib/api'

describe('getAbsoluteUrl', () => {
  describe('dotcom endpoint', () => {
    const dotcomEndpoint = getDotComAPIEndpoint()

    it('handles leading slashes', () => {
      const result = getAbsoluteUrl(dotcomEndpoint, '/user/repos')
      expect(result).toBe('https://api.github.com/user/repos')
    })

    it('handles missing leading slash', () => {
      const result = getAbsoluteUrl(dotcomEndpoint, 'user/repos')
      expect(result).toBe('https://api.github.com/user/repos')
    })
  })

  describe('enterprise endpoint', () => {
    const enterpriseEndpoint = 'https://my-cool-company.com/api/v3'

    it('handles leading slash', () => {
      const result = getAbsoluteUrl(enterpriseEndpoint, '/user/repos')
      expect(result).toBe(`${enterpriseEndpoint}/user/repos`)
    })

    it('handles missing leading slash', () => {
      const result = getAbsoluteUrl(enterpriseEndpoint, 'user/repos')
      expect(result).toBe(`${enterpriseEndpoint}/user/repos`)
    })

    it('handles next page resource which already contains prefix', () => {
      const result = getAbsoluteUrl(
        enterpriseEndpoint,
        '/api/v3/user/repos?page=2'
      )
      expect(result).toBe(`${enterpriseEndpoint}/user/repos?page=2`)
    })
  })
})
