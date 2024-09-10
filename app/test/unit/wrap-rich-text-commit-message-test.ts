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

    expect(summary.length).toBe(1)
    expect(body.length).toBe(0)

    expect(summary[0].kind).toBe(TokenType.Text)
    expect(summary[0].text).toBe(summaryText)
  })

  it('hard wraps text longer than 72 chars', async () => {
    const summaryText =
      'weshouldabsolutelyhardwrapthislongsummarywhichexceeds72charactersyeswetotallyshould'
    const { summary, body } = wrap(summaryText)

    expect(summary.length).toBe(2)
    expect(body.length).toBe(2)

    expect(summary[0].kind).toBe(TokenType.Text)
    expect(summary[0].text).toBe(summaryText.substring(0, 72))
    expect(summary[1].kind).toBe(TokenType.Text)
    expect(summary[1].text).toBe('…')

    expect(body[0].kind).toBe(TokenType.Text)
    expect(body[0].text).toBe('…')
    expect(body[1].kind).toBe(TokenType.Text)
    expect(body[1].text).toBe(summaryText.substring(72))
  })

  it('hard wraps text longer than 72 chars and joins it with the body', async () => {
    const summaryText =
      'weshouldabsolutelyhardwrapthislongsummarywhichexceeds72charactersyeswetotallyshould'
    const bodyText = 'oh hi'
    const { summary, body } = wrap(summaryText, bodyText)

    expect(summary.length).toBe(2)
    expect(body.length).toBe(4)

    expect(summary[0].kind).toBe(TokenType.Text)
    expect(summary[0].text).toBe(summaryText.substring(0, 72))
    expect(summary[1].kind).toBe(TokenType.Text)
    expect(summary[1].text).toBe('…')

    expect(body[0].text).toBe('…')
    expect(body[1].text).toBe(summaryText.substring(72))
    expect(body[2].text).toBe('\n\n')
    expect(body[3].text).toBe(bodyText)
  })

  it('handles summaries which are exactly 72 chars after link shortening', async () => {
    const summaryText =
      'This issue summary should be exactly 72 chars including the issue no: https://github.com/niik/commit-summary-wrap-tests/issues/1'
    const { summary, body } = wrap(summaryText)

    expect(summary.length).toBe(2)
    expect(body.length).toBe(0)

    expect(summary[0].kind).toBe(TokenType.Text)
    expect(summary[0].text).toBe(
      'This issue summary should be exactly 72 chars including the issue no: '
    )
    expect(summary[1].kind).toBe(TokenType.Link)
    expect(summary[1].text).toBe('#1')
  })

  it('takes issue link shortening into consideration', async () => {
    const summaryText =
      'This issue link should be shortened to well under 72 characters: https://github.com/niik/commit-summary-wrap-tests/issues/1'
    const { summary, body } = wrap(summaryText, '')

    expect(summary.length).toBe(2)
    expect(body.length).toBe(0)

    expect(summary[0].kind).toBe(TokenType.Text)
    expect(summary[0].text).toBe(
      'This issue link should be shortened to well under 72 characters: '
    )
    expect(summary[1].kind).toBe(TokenType.Link)
    expect(summary[1].text).toBe('#1')
    expect((summary[1] as HyperlinkMatch).url).toBe(
      'https://github.com/niik/commit-summary-wrap-tests/issues/1'
    )
  })

  it('handles multiple links', async () => {
    const summaryText =
      'Multiple links are fine https://github.com/niik/commit-summary-wrap-tests/issues/1 https://github.com/niik/commit-summary-wrap-tests/issues/2 https://github.com/niik/commit-summary-wrap-tests/issues/3 https://github.com/niik/commit-summary-wrap-tests/issues/4'
    const { summary, body } = wrap(summaryText, '')

    expect(summary.length).toBe(8)
    expect(body.length).toBe(0)

    const flattened = summary.map(x => x.text).join('')
    expect(flattened).toBe('Multiple links are fine #1 #2 #3 #4')
  })

  it('wraps links properly', async () => {
    const summaryText =
      'Link should be truncated but open our release notes https://desktop.github.com/release-notes/'
    const { summary, body } = wrap(summaryText, '')

    expect(summary.length).toBe(3)
    expect(body.length).toBe(2)

    expect(summary[0].kind).toBe(TokenType.Text)
    expect(summary[0].text).toBe(
      'Link should be truncated but open our release notes '
    )

    expect(summary[1].kind).toBe(TokenType.Link)
    expect(summary[1].text).toBe('https://desktop.gith')
    expect((summary[1] as HyperlinkMatch).url).toBe(
      'https://desktop.github.com/release-notes/'
    )

    expect(summary[2].kind).toBe(TokenType.Text)
    expect(summary[2].text).toBe('…')

    expect(body[0].kind).toBe(TokenType.Text)
    expect(body[0].text).toBe('…')

    expect(body[1].kind).toBe(TokenType.Link)
    expect(body[1].text).toBe('ub.com/release-notes/')
    expect((body[1] as HyperlinkMatch).url).toBe(
      'https://desktop.github.com/release-notes/'
    )
  })
})
