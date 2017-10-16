import { expect } from 'chai'

import { formatCommitMessage } from '../../src/lib/format-commit-message'

describe('formatCommitMessage', () => {
  it('omits description when null', () => {
    expect(
      formatCommitMessage({ summary: 'test', description: null })
    ).to.equal('test')
  })

  it('omits description when empty string', () => {
    expect(formatCommitMessage({ summary: 'test', description: '' })).to.equal(
      'test'
    )
  })

  it('adds two newlines between summary and description', () => {
    expect(
      formatCommitMessage({ summary: 'foo', description: 'bar' })
    ).to.equal('foo\n\nbar')
  })
})
