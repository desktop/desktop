import { describe, it } from 'node:test'
import assert from 'node:assert'
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
      assert.equal(testDotCom(true), true)
      assert.equal(testDotCom(false), false)
    })

    it('recognizes GHES', () => {
      assert.equal(testGHES(false), false)
      assert.equal(testGHES(true), true)
    })

    it('recognizes GHAE', () => {
      assert.equal(testGHEDotCom(false), false)
      assert.equal(testGHEDotCom(true), true)
    })

    // If we can't determine the actual version of a GitHub Enterprise Server
    // instance we'll assume it's running the oldest still supported version
    // of GHES. This is defined in the `assumedGHESVersion` constant in
    // endpoint-capabilities.ts and needs to be updated periodically.
    it('assumes GHES versions', () => {
      assert.equal(testGHES('>= 3.1.1'), false)
      assert.equal(testGHES('>= 3.1.0'), true)
    })

    it('parses semver ranges', () => {
      assert.equal(testGHES('>= 1', '1.0.0'), true)
      assert.equal(testGHES('> 1.0.0', '1.0.0'), false)
      assert.equal(testGHES('> 0.9.9', '1.0.0'), true)
    })

    it('deals with common cases (smoketest)', () => {
      assert.equal(
        testEndpoint('https://api.github.com', {
          dotcom: true,
          ghe: false,
          es: '>= 3.0.0',
        }),
        true
      )

      assert.equal(
        testEndpoint(
          'https://ghe.io',
          {
            dotcom: false,
            ghe: false,
            es: '>= 3.1.0',
          },
          '3.1.0'
        ),
        true
      )
    })
  })
})

function testDotCom(
  constraint: boolean,
  endpointVersion: string | SemVer | null = null
) {
  return testEndpoint(
    getDotComAPIEndpoint(),
    { dotcom: constraint, ghe: false, es: false },
    endpointVersion
  )
}

function testGHES(
  constraint: boolean | string,
  endpointVersion: string | SemVer | null = null
) {
  return testEndpoint(
    'https://ghe.io',
    { dotcom: false, ghe: false, es: constraint },
    endpointVersion
  )
}

function testGHEDotCom(constraint: boolean) {
  return testEndpoint('https://corp.ghe.com', {
    dotcom: false,
    ghe: constraint,
    es: false,
  })
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
