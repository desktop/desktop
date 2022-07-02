import { formatCommitMessage } from '../../src/lib/format-commit-message'
import { setupEmptyRepository } from '../helpers/repositories'

describe('formatCommitMessage', () => {
  it('always adds trailing newline', async () => {
    const repo = await setupEmptyRepository()

    expect(
      await formatCommitMessage(repo, { summary: 'test', description: null })
    ).toBe('test\n')
    expect(
      await formatCommitMessage(repo, { summary: 'test', description: 'test' })
    ).toBe('test\n\ntest\n')
  })

  it('omits description when null', async () => {
    const repo = await setupEmptyRepository()
    expect(
      await formatCommitMessage(repo, { summary: 'test', description: null })
    ).toBe('test\n')
  })

  it('omits description when empty string', async () => {
    const repo = await setupEmptyRepository()
    expect(
      await formatCommitMessage(repo, { summary: 'test', description: '' })
    ).toBe('test\n')
  })

  it('adds two newlines between summary and description', async () => {
    const repo = await setupEmptyRepository()
    expect(
      await formatCommitMessage(repo, { summary: 'foo', description: 'bar' })
    ).toBe('foo\n\nbar\n')
  })

  it('appends trailers to a summary-only message', async () => {
    const repo = await setupEmptyRepository()
    const trailers = [
      { token: 'Co-Authored-By', value: 'Markus Olsson <niik@github.com>' },
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]
    expect(
      await formatCommitMessage(repo, {
        summary: 'foo',
        description: null,
        trailers,
      })
    ).toBe(
      'foo\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  it('appends trailers to a regular message', async () => {
    const repo = await setupEmptyRepository()
    const trailers = [
      { token: 'Co-Authored-By', value: 'Markus Olsson <niik@github.com>' },
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]
    expect(
      await formatCommitMessage(repo, {
        summary: 'foo',
        description: 'bar',
        trailers,
      })
    ).toBe(
      'foo\n\nbar\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  // note, this relies on the default git config
  it('merges duplicate trailers', async () => {
    const repo = await setupEmptyRepository()
    const trailers = [
      { token: 'Co-Authored-By', value: 'Markus Olsson <niik@github.com>' },
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]
    expect(
      await formatCommitMessage(repo, {
        summary: 'foo',
        description: 'Co-Authored-By: Markus Olsson <niik@github.com>',
        trailers,
      })
    ).toBe(
      'foo\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  // note, this relies on the default git config
  it('fixes up malformed trailers when trailers are given', async () => {
    const repo = await setupEmptyRepository()
    const trailers = [
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]

    expect(
      await formatCommitMessage(repo, {
        summary: 'foo',
        // note the lack of space after :
        description: 'Co-Authored-By:Markus Olsson <niik@github.com>',
        trailers,
      })
    ).toBe(
      'foo\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })

  // note, this relies on the default git config
  it("doesn't treat --- as end of commit message", async () => {
    const repo = await setupEmptyRepository()
    const trailers = [
      { token: 'Signed-Off-By', value: 'nerdneha <nerdneha@github.com>' },
    ]

    const summary = 'foo'
    const description =
      'hello\n---\nworld\n\nCo-Authored-By: Markus Olsson <niik@github.com>'

    expect(
      await formatCommitMessage(repo, { summary, description, trailers })
    ).toBe(
      'foo\n\nhello\n---\nworld\n\n' +
        'Co-Authored-By: Markus Olsson <niik@github.com>\n' +
        'Signed-Off-By: nerdneha <nerdneha@github.com>\n'
    )
  })
})
