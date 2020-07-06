import { parseCarriageReturn } from '../../src/lib/parse-carriage-return'

describe('parseCarriageReturn', () => {
  it('parses git clone output correctly', () => {
    // The actual, raw, output of a `git clone` call which fails due to a
    // duplicate ref clash (refspec tomfoolery)
    const cloneOutput =
      "Cloning into '/Users/markus/Documents/GitHub/delete-branch-test'...\n" +
      'remote: Enumerating objects: 8, done.        \n' +
      'remote: Counting objects:  12% (1/8)        \r' +
      'remote: Counting objects:  25% (2/8)        \r' +
      'remote: Counting objects:  37% (3/8)        \r' +
      'remote: Counting objects:  50% (4/8)        \r' +
      'remote: Counting objects:  62% (5/8)        \r' +
      'remote: Counting objects:  75% (6/8)        \r' +
      'remote: Counting objects:  87% (7/8)        \r' +
      'remote: Counting objects: 100% (8/8)        \r' +
      'remote: Counting objects: 100% (8/8), done.        \n' +
      'remote: Compressing objects:  16% (1/6)        \r' +
      'remote: Compressing objects:  33% (2/6)        \r' +
      'remote: Compressing objects:  50% (3/6)        \r' +
      'remote: Compressing objects:  66% (4/6)        \r' +
      'remote: Compressing objects:  83% (5/6)        \r' +
      'remote: Compressing objects: 100% (6/6)        \r' +
      'remote: Compressing objects: 100% (6/6), done.        \n' +
      'remote: Total 8 (delta 1), reused 7 (delta 0), pack-reused 0        \n' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects:  12% (1/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects:  25% (2/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects:  37% (3/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects:  50% (4/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects:  62% (5/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects:  75% (6/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects:  87% (7/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects: 100% (8/8)\r' +
      '\r' +
      '                                                                                \r' +
      'Receiving objects: 100% (8/8), done.\n' +
      '\r' +
      '                                                                                \r' +
      'Resolving deltas:   0% (0/1)\r' +
      '\r' +
      '                                                                                \r' +
      'Resolving deltas: 100% (1/1)\r' +
      '\r' +
      '                                                                                \r' +
      'Resolving deltas: 100% (1/1), done.\n' +
      "fatal: multiple updates for ref 'refs/remotes/origin/pr/1' not allowed\n"

    const expected =
      "Cloning into '/Users/markus/Documents/GitHub/delete-branch-test'...\n" +
      'remote: Enumerating objects: 8, done.        \n' +
      'remote: Counting objects: 100% (8/8), done.        \n' +
      'remote: Compressing objects: 100% (6/6), done.        \n' +
      'remote: Total 8 (delta 1), reused 7 (delta 0), pack-reused 0        \n' +
      'Receiving objects: 100% (8/8), done.                                            \n' +
      'Resolving deltas: 100% (1/1), done.                                             \n' +
      "fatal: multiple updates for ref 'refs/remotes/origin/pr/1' not allowed\n"

    expect(parseCarriageReturn(cloneOutput)).toBe(expected)
  })

  it("has no problems with strings that don't contain carriage returns", () => {
    expect(parseCarriageReturn('foo')).toBe('foo')
    expect(parseCarriageReturn('foo\nbar')).toBe('foo\nbar')
  })

  it('handles terminating carriage returns', () => {
    expect(parseCarriageReturn('foo\r')).toBe('foo')
    expect(parseCarriageReturn('foo\nbar\r')).toBe('foo\nbar')
  })

  it('handles strings terminating without newline or CR', () => {
    expect(parseCarriageReturn('foo\rbar')).toBe('bar')
    expect(parseCarriageReturn('foo\r\r\r\r\rbar')).toBe('bar')
  })

  it('treats unicode line separator and paragraph separator as flow text', () => {
    // https://www.regular-expressions.info/dot.html
    // [...] JavaScript adds the Unicode line separator \u2028 and paragraph
    // separator \u2029 on top of that
    expect(parseCarriageReturn('foo\rfoo\u2028bar\u2029foo')).toBe(
      'foo\u2028bar\u2029foo'
    )
  })

  it('handles remaining characters from previous lines', () => {
    expect(parseCarriageReturn('foobar\rfooba\rfoob\rfoo\r\fo\rF\r')).toBe(
      'Foobar'
    )
  })

  it("handles Windows' new lines", () => {
    expect(parseCarriageReturn('A\r\nB\r\nC\r\nD\r\n')).toBe('A\nB\nC\nD\n')
  })
})
