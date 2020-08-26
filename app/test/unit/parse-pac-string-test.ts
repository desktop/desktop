import { parsePACString } from '../../src/lib/parse-pac-string'

describe('parsePACString', () => {
  it('returns no url for DIRECT', () => {
    expect(parsePACString('DIRECT')).toBeNull()
  })

  it('parses Chromium PAC strings', () => {
    expect(parsePACString('PROXY myproxy:80;DIRECT')).toEqual([
      'http://myproxy:80',
    ])

    expect(parsePACString('PROXY myproxy:80')).toEqual(['http://myproxy:80'])
    expect(parsePACString('PROXY myproxy:80; HTTPS secureproxy:443')).toEqual([
      'http://myproxy:80',
      'https://secureproxy:443',
    ])

    expect(
      parsePACString(
        'PROXY a:1;HTTP b:2;HTTPS c:3;SOCKS d:4;SOCKS4 e:5;SOCKS5 f:5;DIRECT'
      )
    ).toEqual([
      'http://a:1',
      'http://b:2',
      'https://c:3',
      'socks4://d:4',
      'socks4://e:5',
      'socks5://f:5',
    ])
  })

  // not strictly necessary as Chromium doesn't add space inbetween
  it('parses PAC strings with white space between specs', () => {
    expect(
      parsePACString(
        'PROXY a:1; HTTP b:2 ;\tHTTPS c:3\t;\tSOCKS d:4 ; SOCKS4 e:5  ;  SOCKS5 f:5  ; DIRECT'
      )
    ).toEqual([
      'http://a:1',
      'http://b:2',
      'https://c:3',
      'socks4://d:4',
      'socks4://e:5',
      'socks5://f:5',
    ])
  })

  it("skips protocols cURL doesn't understand", () => {
    const urls = parsePACString('QUIC qhost:1;PROXY phost:2;DIRECT')
    expect(urls).toEqual(['http://phost:2'])
  })

  it('skips invalid specs', () => {
    const urls = parsePACString('PROXY;HTTPS;DIRECT')
    expect(urls).toBeNull()
  })
})
