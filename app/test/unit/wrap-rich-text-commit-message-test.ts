import { wrapRichTextCommitMessage } from '../../src/lib/wrap-rich-text-commit-message'
import {
  TokenType,
  Tokenizer,
  HyperlinkMatch,
} from '../../src/lib/text-token-parser'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { Repository } from '../../src/models/repository'

describe('wrapRichTextCommitMessage', () => {
  const emojis = new Map<string, string>()
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
    expect(summary[0].text).toBe(summaryText.substr(0, 72))
    expect(summary[1].kind).toBe(TokenType.Text)
    expect(summary[1].text).toBe('…')

    expect(body[0].kind).toBe(TokenType.Text)
    expect(body[0].text).toBe('…')
    expect(body[1].kind).toBe(TokenType.Text)
    expect(body[1].text).toBe(summaryText.substr(72))
  })

  it('hard wraps text longer than 72 chars and joins it with the body', async () => {
    const summaryText =
      'weshouldabsolutelyhardwrapthislongsummarywhichexceeds72charactersyeswetotallyshould'
    const bodyText = 'oh hi'
    const { summary, body } = wrap(summaryText, bodyText)

    expect(summary.length).toBe(2)
    expect(body.length).toBe(4)

    expect(summary[0].kind).toBe(TokenType.Text)
    expect(summary[0].text).toBe(summaryText.substr(0, 72))
    expect(summary[1].kind).toBe(TokenType.Text)
    expect(summary[1].text).toBe('…')

    expect(body[0].text).toBe('…')
    expect(body[1].text).toBe(summaryText.substr(72))
    expect(body[2].text).toBe('\n\n')
    expect(body[3].text).toBe(bodyText)
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
})
