import { truncateWithEllipsis } from '../../src/lib/truncate-with-ellipsis'

describe('truncateWithEllipsis', () => {
  it('does not truncate a string that fits', () => {
    const str = 'short'
    const result = truncateWithEllipsis(str, 25)
    expect(result).toEqual(str)
  })

  it('does not truncate a max length string', () => {
    const str = 'this-is-max-length-string'
    const result = truncateWithEllipsis(str, str.length)
    expect(result).toEqual(str)
  })

  it('truncates a string that does not fit', () => {
    const str = 'this-string-exceeds-max-length'
    const result = truncateWithEllipsis(str, 25)
    expect(result).toEqual('this-string-exceeds-max-l…')
  })

  it('does not truncate a unicode string that fits', () => {
    const str = '🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔☀\uFE0F'
    const result = truncateWithEllipsis(str, 25)
    expect(result).toEqual(str)
  })

  it('does not truncate a max length unicode string', () => {
    const str = '🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔☀\uFE0F🌤⛅\uFE0F🌥☁\uFE0F🌦🌧⛈🌩🌨'
    const result = truncateWithEllipsis(str, 22)
    expect(result).toEqual(str)
  })

  it('truncates a unicode string that does not fit', () => {
    const str = '🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔☀\uFE0F🌤⛅\uFE0F🌥☁\uFE0F🌦🌧⛈🌩🌨'
    const result = truncateWithEllipsis(str, 13)
    expect(result).toEqual('🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔☀\uFE0F…')
  })
})
