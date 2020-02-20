import { envForProxy } from '../../../src/lib/git/environment'

describe('git/environmnent', () => {
  const httpProxyUrl = 'http://proxy:8888/'
  const httpsProxyUrl = 'https://proxy:8888/'

  // const nullResolver = (url:string) => undefined
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
  })
})
