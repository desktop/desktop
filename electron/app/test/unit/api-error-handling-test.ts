import { describe, it } from 'node:test'
import assert from 'node:assert'
import { APIError, getAbsoluteUrl } from '../../src/lib/http'

describe('http', () => {
  describe('APIError', () => {
    it('creates an error with API message', () => {
      const response = new Response('', {
        status: 422,
        statusText: 'Unprocessable Entity',
      })
      Object.defineProperty(response, 'url', {
        value: 'https://api.github.com/repos/owner/repo',
      })

      const apiError = {
        message: 'Validation Failed',
        errors: [
          {
            message: 'name already exists',
            resource: 'Repository',
            field: 'name',
          },
        ],
      }

      const error = new APIError(response, apiError)

      assert.equal(error.responseStatus, 422)
      assert.ok(error.message.includes('Validation Failed'))
      assert.ok(error.message.includes('name already exists'))
      assert.notEqual(error.apiError, null)
    })

    it('creates an error with fallback message when no API error', () => {
      const response = new Response('', {
        status: 500,
        statusText: 'Internal Server Error',
      })
      Object.defineProperty(response, 'url', {
        value: 'https://api.github.com/repos/owner/repo',
      })

      const error = new APIError(response, null)

      assert.equal(error.responseStatus, 500)
      assert.ok(error.message.includes('500'))
      assert.equal(error.apiError, null)
    })

    it('handles API error without additional errors array', () => {
      const response = new Response('', {
        status: 403,
        statusText: 'Forbidden',
      })
      Object.defineProperty(response, 'url', {
        value: 'https://api.github.com/user',
      })

      const apiError = { message: 'Resource not accessible by integration' }

      const error = new APIError(response, apiError)

      assert.equal(error.responseStatus, 403)
      assert.equal(error.message, 'Resource not accessible by integration')
    })

    it('handles common HTTP status codes', () => {
      const statusCodes = [
        { status: 401, text: 'Unauthorized' },
        { status: 403, text: 'Forbidden' },
        { status: 404, text: 'Not Found' },
        { status: 422, text: 'Unprocessable Entity' },
        { status: 500, text: 'Internal Server Error' },
      ]

      for (const { status, text } of statusCodes) {
        const response = new Response('', { status, statusText: text })
        Object.defineProperty(response, 'url', {
          value: 'https://api.github.com/test',
        })

        const error = new APIError(response, null)
        assert.equal(error.responseStatus, status)
      }
    })
  })

  describe('getAbsoluteUrl', () => {
    it('constructs URL from endpoint and path', () => {
      const url = getAbsoluteUrl('https://api.github.com', '/repos/owner/repo')
      assert.equal(url, 'https://api.github.com/repos/owner/repo')
    })

    it('handles endpoint without trailing slash', () => {
      const url = getAbsoluteUrl('https://api.github.com', 'repos/owner/repo')
      assert.equal(url, 'https://api.github.com/repos/owner/repo')
    })

    it('handles endpoint with trailing slash', () => {
      const url = getAbsoluteUrl('https://api.github.com/', 'repos/owner/repo')
      assert.equal(url, 'https://api.github.com/repos/owner/repo')
    })

    it('strips duplicate api/v3/ prefix from path', () => {
      const url = getAbsoluteUrl(
        'https://ghe.example.com/api/v3/',
        'api/v3/repos/owner/repo'
      )
      assert.equal(url, 'https://ghe.example.com/api/v3/repos/owner/repo')
    })

    it('handles enterprise endpoints', () => {
      const url = getAbsoluteUrl(
        'https://ghe.example.com/api/v3',
        '/repos/owner/repo'
      )
      assert.equal(url, 'https://ghe.example.com/api/v3/repos/owner/repo')
    })
  })
})
