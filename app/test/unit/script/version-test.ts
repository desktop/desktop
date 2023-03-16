import { getNextVersionNumber } from '../../../../script/draft-release/version'

describe('getNextVersionNumber', () => {
  describe('production', () => {
    const channel = 'production'

    it('increments the patch number', () => {
      expect(getNextVersionNumber('1.0.1', channel)).toBe('1.0.2')
    })

    describe("doesn't care for", () => {
      it('beta versions', () => {
        const version = '1.0.1-beta1'
        expect(() => getNextVersionNumber(version, channel)).toThrow(
          `Unable to draft production release using beta version '${version}'`
        )
      })
      it('test versions', () => {
        const version = '1.0.1-test42'
        expect(() => getNextVersionNumber('1.0.1-test42', channel)).toThrow(
          `Unable to draft production release using test version '${version}'`
        )
      })
    })
  })

  describe('beta', () => {
    const channel = 'beta'

    describe('when a beta version is used', () => {
      it('the beta tag is incremented', () => {
        expect(getNextVersionNumber('1.1.2-beta3', channel)).toBe('1.1.2-beta4')
      })
      it('handles multiple digits', () => {
        expect(getNextVersionNumber('1.1.2-beta99', channel)).toBe(
          '1.1.2-beta100'
        )
      })
    })

    describe('when a production version is used', () => {
      it('increments the patch and returns the first beta', () => {
        expect(getNextVersionNumber('1.0.1', channel)).toBe('1.0.2-beta1')
      })
    })

    describe("doesn't care for", () => {
      it('test versions', () => {
        const version = '1.0.1-test1'
        expect(() => getNextVersionNumber(version, channel)).toThrow(
          `Unable to draft beta release using test version '${version}'`
        )
      })
    })
  })
})
