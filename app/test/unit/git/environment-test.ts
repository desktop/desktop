import { envForProxy } from '../../../src/lib/git/environment'

describe('git/environmnent', () => {
  const httpProxyUrl = 'http://proxy:8888/'
  const httpsProxyUrl = 'https://proxy:8888/'

  const nullResolver = () => Promise.resolve(undefined)
  const throwingResolver = () => Promise.reject(new Error('such error'))
  const defaultResolver = async (url: string) => {
    if (url.startsWith('http://')) {
      return httpProxyUrl
    } else if (url.startsWith('https://')) {
      return httpsProxyUrl
    } else {
      return undefined
    }
  }

  describe('envForProxy', () => {
    it('sets the correct environment variable based on protocol', async () => {
      expect(
        await envForProxy('https://github.com/', {}, defaultResolver)
      ).toEqual({
        https_proxy: httpsProxyUrl,
      })

      expect(
        await envForProxy('http://github.com/', {}, defaultResolver)
      ).toEqual({
        http_proxy: httpProxyUrl,
      })
    })

    it('fails gracefully if resolver throws', async () => {
      expect(
        await envForProxy('https://github.com/', {}, throwingResolver)
      ).toEqual(undefined)
    })

    it("it doesn't set any variables if resolver returns undefined", async () => {
      expect(
        await envForProxy('https://github.com/', {}, nullResolver)
      ).toEqual(undefined)
    })

    it('sets the correct environment variable based on protocol', async () => {
      expect(
        await envForProxy('https://github.com/', {}, defaultResolver)
      ).toEqual({
        https_proxy: httpsProxyUrl,
      })

      expect(
        await envForProxy('http://github.com/', {}, defaultResolver)
      ).toEqual({
        http_proxy: httpProxyUrl,
      })
    })

    it('ignores unknown protocols', async () => {
      expect(
        await envForProxy('ftp://github.com/', {}, defaultResolver)
      ).toEqual(undefined)
    })

    it('does not override existing environment variables', async () => {
      expect(
        await envForProxy(
          'https://github.com/',
          { https_proxy: 'foo' },
          defaultResolver
        )
      ).toEqual(undefined)

      expect(
        await envForProxy(
          'https://github.com/',
          { HTTPS_PROXY: 'foo' },
          defaultResolver
        )
      ).toEqual(undefined)

      expect(
        await envForProxy(
          'http://github.com/',
          { http_proxy: 'foo' },
          defaultResolver
        )
      ).toEqual(undefined)

      expect(
        await envForProxy(
          'https://github.com/',
          { ALL_PROXY: 'foo' },
          defaultResolver
        )
      ).toEqual(undefined)

      expect(
        await envForProxy(
          'https://github.com/',
          { all_proxy: 'foo' },
          defaultResolver
        )
      ).toEqual(undefined)
    })
  })
})
