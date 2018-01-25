import { expect } from 'chai'

import { formatCommitMessage } from '../../src/lib/format-commit-message'
import { setupEmptyRepository } from '../helpers/repositories'

describe('formatCommitMessage', () => {
  it('always adds trailing newline', async () => {
    const repo = await setupEmptyRepository()

    expect(await formatCommitMessage(repo, 'test', null)).to.equal('test\n')
    expect(await formatCommitMessage(repo, 'test', 'test')).to.equal(
      'test\n\ntest\n'
    )
  })

  it('omits description when null', async () => {
    const repo = await setupEmptyRepository()
    expect(await formatCommitMessage(repo, 'test', null)).to.equal('test\n')
  })

  it('omits description when empty string', async () => {
    const repo = await setupEmptyRepository()
    expect(await formatCommitMessage(repo, 'test', '')).to.equal('test\n')
  })

  it('adds two newlines between summary and description', async () => {
    const repo = await setupEmptyRepository()
    expect(await formatCommitMessage(repo, 'foo', 'bar')).to.equal(
      'foo\n\nbar\n'
    )
  })
})
