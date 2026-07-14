import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatCommitMessage } from '../../src/lib/format-commit-message'
import { setupEmptyRepository } from '../helpers/repositories'

describe('formatCommitMessage', () => {
  it('always adds trailing newline', async t => {
    const repo = await setupEmptyRepository(t)

    assert.equal(
      await formatCommitMessage(repo, { summary: 'test', description: null }),
      'test\n'
    )
    assert.equal(
      await formatCommitMessage(repo, { summary: 'test', description: 'test' }),
      'test\n\ntest\n'
    )
  })

  it('omits description when null', async t => {
    const repo = await setupEmptyRepository(t)
    assert.equal(
      await formatCommitMessage(repo, { summary: 'test', description: null }),
      'test\n'
    )
  })

  it('omits description when empty string', async t => {
    const repo = await setupEmptyRepository(t)
    assert.equal(
      await formatCommitMessage(repo, { summary: 'test', description: '' }),
      'test\n'
    )
  })

  it('adds two newlines between summary and description', async t => {
    const repo = await setupEmptyRepository(t)
    assert.equal(
      await formatCommitMessage(repo, { summary: 'foo', description: 'bar' }),
      'foo\n\nbar\n'
    )
  })

  it('appends trailers to a summary-only message', async t => {
    const repo = await setupEmptyRepository(t)
    const trailers = [
      { token: 'Co-Authored-By', value: 'Markus Olsson <niik@github.com>' },
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]
    assert.equal(
      await formatCommitMessage(repo, {
        summary: 'foo',
        description: null,
        trailers,
      }),
      'foo\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  it('appends trailers to a regular message', async t => {
    const repo = await setupEmptyRepository(t)
    const trailers = [
      { token: 'Co-Authored-By', value: 'Markus Olsson <niik@github.com>' },
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]
    assert.equal(
      await formatCommitMessage(repo, {
        summary: 'foo',
        description: 'bar',
        trailers,
      }),
      'foo\n\nbar\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  // note, this relies on the default git config
  it('merges duplicate trailers', async t => {
    const repo = await setupEmptyRepository(t)
    const trailers = [
      { token: 'Co-Authored-By', value: 'Markus Olsson <niik@github.com>' },
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]
    assert.equal(
      await formatCommitMessage(repo, {
        summary: 'foo',
        description: 'Co-Authored-By: Markus Olsson <niik@github.com>',
        trailers,
      }),
      'foo\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  // note, this relies on the default git config
  it('fixes up malformed trailers when trailers are given', async t => {
    const repo = await setupEmptyRepository(t)
    const trailers = [
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]

    assert.equal(
      await formatCommitMessage(repo, {
        summary: 'foo',
        // note the lack of space after :
        description: 'Co-Authored-By:Markus Olsson <niik@github.com>',
        trailers,
      }),
      'foo\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  // note, this relies on the default git config
  it("doesn't treat --- as end of commit message", async t => {
    const repo = await setupEmptyRepository(t)
    const trailers = [
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]

    const summary = 'foo'
    const description =
      'hello\n---\nworld\n\nCo-Authored-By: Markus Olsson <niik@github.com>'

    assert.equal(
      await formatCommitMessage(repo, { summary, description, trailers }),
      'foo\n\nhello\n---\nworld\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })
})
