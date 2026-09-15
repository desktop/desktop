import { describe, it } from 'node:test'
import assert from 'node:assert'
import { wrapRichTextCommitMessage } from '../../src/lib/wrap-rich-text-commit-message'
import {
  TokenType,
  Tokenizer,
  HyperlinkMatch,
} from '../../src/lib/text-token-parser'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { Repository } from '../../src/models/repository'
import { Emoji } from '../../src/lib/emoji'

describe('wrapRichTextCommitMessage', () => {
  const emojis = new Map<string, Emoji>()
  const repo = new Repository(
    '.',
    -1,
    gitHubRepoFixture({
      owner: 'niik',
      name: 'commit-summary-wrap-tests',
    }),
    false
  )
  const tokenizer = new Tokenizer(emojis, repo)

  /** helper */
  function wrap(summary: string, body: string = '') {
    return wrapRichTextCommitMessage(summary, body, tokenizer)
  }

  it("doesn't wrap at exactly 72 chars", async () => {
    const summaryText =
      'weshouldnothardwrapthislongsummarywhichisexactly72charactersyeswetotally'
    const { summary, body } = wrap(summaryText)

    assert.equal(summary.length, 1)
    assert.equal(body.length, 0)

    assert.equal(summary[0].kind, TokenType.Text)
    assert.equal(summary[0].text, summaryText)
  })

  it('hard wraps text longer than 72 chars', async () => {
    const summaryText =
      'weshouldabsolutelyhardwrapthislongsummarywhichexceeds72charactersyeswetotallyshould'
    const { summary, body } = wrap(summaryText)

    assert.equal(summary.length, 2)
    assert.equal(body.length, 2)

    assert.equal(summary[0].kind, TokenType.Text)
    assert.equal(summary[0].text, summaryText.substring(0, 72))
    assert.equal(summary[1].kind, TokenType.Text)
    assert.equal(summary[1].text, '…')

    assert.equal(body[0].kind, TokenType.Text)
    assert.equal(body[0].text, '…')
    assert.equal(body[1].kind, TokenType.Text)
    assert.equal(body[1].text, summaryText.substring(72))
  })

  it('hard wraps text longer than 72 chars and joins it with the body', async () => {
    const summaryText =
      'weshouldabsolutelyhardwrapthislongsummarywhichexceeds72charactersyeswetotallyshould'
    const bodyText = 'oh hi'
    const { summary, body } = wrap(summaryText, bodyText)

    assert.equal(summary.length, 2)
    assert.equal(body.length, 4)

    assert.equal(summary[0].kind, TokenType.Text)
    assert.equal(summary[0].text, summaryText.substring(0, 72))
    assert.equal(summary[1].kind, TokenType.Text)
    assert.equal(summary[1].text, '…')

    assert.equal(body[0].text, '…')
    assert.equal(body[1].text, summaryText.substring(72))
    assert.equal(body[2].text, '\n\n')
    assert.equal(body[3].text, bodyText)
  })

  it('handles summaries which are exactly 72 chars after link shortening', async () => {
    const summaryText =
      'This issue summary should be exactly 72 chars including the issue no: https://github.com/niik/commit-summary-wrap-tests/issues/1'
    const { summary, body } = wrap(summaryText)

    assert.equal(summary.length, 2)
    assert.equal(body.length, 0)

    assert.equal(summary[0].kind, TokenType.Text)
    assert.equal(
      summary[0].text,
      'This issue summary should be exactly 72 chars including the issue no: '
    )
    assert.equal(summary[1].kind, TokenType.Link)
    assert.equal(summary[1].text, '#1')
  })

  it('takes issue link shortening into consideration', async () => {
    const summaryText =
      'This issue link should be shortened to well under 72 characters: https://github.com/niik/commit-summary-wrap-tests/issues/1'
    const { summary, body } = wrap(summaryText, '')

    assert.equal(summary.length, 2)
    assert.equal(body.length, 0)

    assert.equal(summary[0].kind, TokenType.Text)
    assert.equal(
      summary[0].text,
      'This issue link should be shortened to well under 72 characters: '
    )
    assert.equal(summary[1].kind, TokenType.Link)
    assert.equal(summary[1].text, '#1')
    assert.equal(
      (summary[1] as HyperlinkMatch).url,
      'https://github.com/niik/commit-summary-wrap-tests/issues/1'
    )
  })

  it('handles multiple links', async () => {
    const summaryText =
      'Multiple links are fine https://github.com/niik/commit-summary-wrap-tests/issues/1 https://github.com/niik/commit-summary-wrap-tests/issues/2 https://github.com/niik/commit-summary-wrap-tests/issues/3 https://github.com/niik/commit-summary-wrap-tests/issues/4'
    const { summary, body } = wrap(summaryText, '')

    assert.equal(summary.length, 8)
    assert.equal(body.length, 0)

    const flattened = summary.map(x => x.text).join('')
    assert.equal(flattened, 'Multiple links are fine #1 #2 #3 #4')
  })

  it('wraps links properly', async () => {
    const summaryText =
      'Link should be truncated but open our release notes https://desktop.github.com/release-notes/'
    const { summary, body } = wrap(summaryText, '')

    assert.equal(summary.length, 3)
    assert.equal(body.length, 2)

    assert.equal(summary[0].kind, TokenType.Text)
    assert.equal(
      summary[0].text,
      'Link should be truncated but open our release notes '
    )

    assert.equal(summary[1].kind, TokenType.Link)
    assert.equal(summary[1].text, 'https://desktop.gith')
    assert.equal(
      (summary[1] as HyperlinkMatch).url,
      'https://desktop.github.com/release-notes/'
    )

    assert.equal(summary[2].kind, TokenType.Text)
    assert.equal(summary[2].text, '…')

    assert.equal(body[0].kind, TokenType.Text)
    assert.equal(body[0].text, '…')

    assert.equal(body[1].kind, TokenType.Link)
    assert.equal(body[1].text, 'ub.com/release-notes/')
    assert.equal(
      (body[1] as HyperlinkMatch).url,
      'https://desktop.github.com/release-notes/'
    )
  })
})
