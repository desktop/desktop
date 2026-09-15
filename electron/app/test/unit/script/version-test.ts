import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getNextVersionNumber } from '../../../../script/draft-release/version'

describe('getNextVersionNumber', () => {
  describe('production', () => {
    const channel = 'production'

    it('increments the patch number', () => {
      assert.equal(getNextVersionNumber('1.0.1', channel), '1.0.2')
    })

    describe("doesn't care for", () => {
      it('beta versions', () => {
        assert.throws(
          () => getNextVersionNumber('1.0.1-beta1', channel),
          /Unable to draft production release using beta version '1\.0\.1-beta1'/
        )
      })
      it('test versions', () => {
        assert.throws(
          () => getNextVersionNumber('1.0.1-test42', channel),
          /Unable to draft production release using test version '1\.0\.1-test42'/
        )
      })
    })
  })

  describe('beta', () => {
    const channel = 'beta'

    describe('when a beta version is used', () => {
      it('the beta tag is incremented', () => {
        assert.equal(
          getNextVersionNumber('1.1.2-beta3', channel),
          '1.1.2-beta4'
        )
      })
      it('handles multiple digits', () => {
        assert.equal(
          getNextVersionNumber('1.1.2-beta99', channel),
          '1.1.2-beta100'
        )
      })
    })

    describe('when a production version is used', () => {
      it('increments the patch and returns the first beta', () => {
        assert.equal(getNextVersionNumber('1.0.1', channel), '1.0.2-beta1')
      })
    })

    describe("doesn't care for", () => {
      it('test versions', () => {
        assert.throws(
          () => getNextVersionNumber('1.0.1-test1', channel),
          /Unable to draft beta release using test version '1\.0\.1-test1'/
        )
      })
    })
  })
})
