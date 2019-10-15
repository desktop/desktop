import { sanitizedBranchName } from '../../src/lib/sanitize-branch'

describe('sanitizedBranchName', () => {
  it('leaves a good branch name alone', () => {
    const branchName = 'this-is/fine'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('this-is/fine')
  })

  it('replaces invalid characters with dashes', () => {
    const branchName = '.this..is\\not fine:yo?|is-it'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('this-is-not-fine-yo-is-it')
  })

  it('does not allow branch name to end in slash', () => {
    const branchName = 'hello/'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('hello-')
  })

  it('does not allow name to start with plus', () => {
    const branchName = '++but-can-still-keep-the-rest'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('but-can-still-keep-the-rest')
  })

  it('does not allow name to start with minus', () => {
    const branchName = '--but-can-still-keep-the-rest'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('but-can-still-keep-the-rest')
  })

  it('does not allow name to end in `.lock`', () => {
    const branchName = 'foo.lock.lock'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('foo.lock-')
  })

  it('replaces newlines with dash', () => {
    const branchName = 'hello\r\nworld'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('hello-world')
  })

  it('removes starting dot', () => {
    const branchName = '.first.dot.is.not.ok'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe('first.dot.is.not.ok')
  })

  it('allows double dashes after first character', () => {
    const branchName = 'branch--name'
    const result = sanitizedBranchName(branchName)
    expect(result).toBe(branchName)
  })
})
