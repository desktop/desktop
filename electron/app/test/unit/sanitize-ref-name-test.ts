import { describe, it } from 'node:test'
import assert from 'node:assert'
import { sanitizedRefName } from '../../src/lib/sanitize-ref-name'

describe('sanitizedBranchName', () => {
  it('leaves a good branch name alone', () => {
    const branchName = 'this-is/fine'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'this-is/fine')
  })

  it('replaces invalid characters with dashes', () => {
    const branchName = '.this..is\\not fine:yo?|is-it'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'this-is-not-fine-yo-is-it')
  })

  it('does not allow branch name to end in slash', () => {
    const branchName = 'hello/'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'hello-')
  })

  it('does not allow name to start with plus', () => {
    const branchName = '++but-can-still-keep-the-rest'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'but-can-still-keep-the-rest')
  })

  it('does not allow name to start with minus', () => {
    const branchName = '--but-can-still-keep-the-rest'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'but-can-still-keep-the-rest')
  })

  it('does not allow name to end in `.lock`', () => {
    const branchName = 'foo.lock.lock'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'foo.lock-')
  })

  it('replaces newlines with dash', () => {
    const branchName = 'hello\r\nworld'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'hello-world')
  })

  it('removes starting dot', () => {
    const branchName = '.first.dot.is.not.ok'
    const result = sanitizedRefName(branchName)
    assert.equal(result, 'first.dot.is.not.ok')
  })

  it('allows double dashes after first character', () => {
    const branchName = 'branch--name'
    const result = sanitizedRefName(branchName)
    assert.equal(result, branchName)
  })
})
