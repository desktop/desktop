import {
  endpointSatisfies,
  VersionConstraint,
} from '../../src/lib/endpoint-capabilities'
import { SemVer, parse } from 'semver'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { forceUnwrap } from '../../src/lib/fatal-error'

describe('endpoint-capabilities', () => {
  describe('endpointSatisfies', () => {
    it('recognizes github.com', () => {
      expect(testDotCom(true)).toBeTrue()
      expect(testDotCom(false)).toBeFalse()
    })

    it('recognizes GHES', () => {
      expect(testGHES(false)).toBeFalse()
      expect(testGHES(true)).toBeTrue()
    })

    it('recognizes GHAE', () => {
      expect(testGHAE(false)).toBeFalse()
      expect(testGHAE(true)).toBeTrue()
    })

    // GHAE doesn't advertise the installed version so we'll assume its
    // capabilities match that of a recent supported version of GHES. This is
    // defined in the `assumedGHAEVersion` constant in endpoint-capabilities.ts
    // and needs to be updated periodically.
    it('assumes GHAE versions', () => {
      expect(testGHAE('>= 3.2.1')).toBeFalse()
      expect(testGHAE('>= 3.2.0')).toBeTrue()
    })

    // If we can't determine the actual version of a GitHub Enterprise Server
    // instance we'll assume it's running the oldest still supported version
    // of GHES. This is defined in the `assumedGHESVersion` constant in
    // endpoint-capabilities.ts and needs to be updated periodically.
    it('assumes GHES versions', () => {
      expect(testGHES('>= 3.1.1')).toBeFalse()
      expect(testGHES('>= 3.1.0')).toBeTrue()
    })

    it('parses semver ranges', () => {
      expect(testGHES('>= 1', '1.0.0')).toBeTrue()
      expect(testGHES('> 1.0.0', '1.0.0')).toBeFalse()
      expect(testGHES('> 0.9.9', '1.0.0')).toBeTrue()
    })

    it('deals with common cases (smoketest)', () => {
      expect(
        testEndpoint('https://api.github.com', {
          dotcom: true,
          ae: '>= 3.0.0',
          es: '>= 3.0.0',
        })
      ).toBeTrue()

      expect(
        testEndpoint(
          'https://ghe.io',
          {
            dotcom: false,
            ae: '>= 4.0.0',
            es: '>= 3.1.0',
          },
          '3.1.0'
        )
      ).toBeTrue()
    })
  })
})

function testDotCom(
  constraint: boolean,
  endpointVersion: string | SemVer | null = null
) {
  return testEndpoint(
    getDotComAPIEndpoint(),
    { dotcom: constraint, ae: false, es: false },
    endpointVersion
  )
}

function testGHES(
  constraint: boolean | string,
  endpointVersion: string | SemVer | null = null
) {
  return testEndpoint(
    'https://ghe.io',
    { dotcom: false, ae: false, es: constraint },
    endpointVersion
  )
}

function testGHAE(
  constraint: boolean | string,
  endpointVersion: string | SemVer | null = null
) {
  return testEndpoint(
    'https://corp.ghe.com',
    { dotcom: false, ae: constraint, es: false },
    endpointVersion
  )
}

function testEndpoint(
  endpoint: string,
  constraint: VersionConstraint,
  endpointVersion: string | SemVer | null = null
) {
  const version = endpointVersion
    ? forceUnwrap(`Couldn't parse endpoint version`, parse(endpointVersion))
    : null
  return endpointSatisfies(constraint, () => version)(endpoint)
}
