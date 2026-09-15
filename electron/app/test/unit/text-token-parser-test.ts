import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Emoji } from '../../src/lib/emoji'
import {
  Tokenizer,
  TokenType,
  EmojiMatch,
  HyperlinkMatch,
} from '../../src/lib/text-token-parser'
import { Repository } from '../../src/models/repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

const emoji = new Map<string, Emoji>([
  [
    ':shipit:',
    {
      url: '/some/path.png',
      aliases: [':shipit:'],
    },
  ],
])

describe('Tokenizer', () => {
  describe('basic tests', () => {
    it('preserves plain text string', () => {
      const text = 'this is a string without anything interesting'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, text)
    })

    it('returns emoji between two string elements', () => {
      const text = "let's :shipit: this thing"
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 3)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, "let's ")
      assert.equal(results[1].kind, TokenType.Emoji)
      assert.equal(results[1].text, ':shipit:')
      assert.equal(results[2].kind, TokenType.Text)
      assert.equal(results[2].text, ' this thing')
    })
  })

  describe('with GitHub repository', () => {
    const host = 'https://github.com'
    const login = 'shiftkey'
    const name = 'some-repo'
    const htmlURL = `${host}/${login}/${name}`

    const gitHubRepository = gitHubRepoFixture({
      name,
      owner: login,
      isPrivate: false,
    })

    const repository = new Repository(
      'some/path/to/repo',
      1,
      gitHubRepository,
      false
    )

    it('renders an emoji match', () => {
      const text = 'releasing the thing :shipit:'
      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 2)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'releasing the thing ')

      assert.equal(results[1].kind, TokenType.Emoji)
      const match = results[1] as EmojiMatch

      assert.equal(match.text, ':shipit:')
      assert.equal(match.path, '/some/path.png')
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'releasing the thing :unknown:')
    })

    it('does not render link when email address found', () => {
      const text = 'the email address support@github.com should be ignored'
      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(
        results[0].text,
        'the email address support@github.com should be ignored'
      )
    })

    it('render mention when text starts with a @', () => {
      const expectedUri = `${host}/${login}`
      const text = `@${login} was here`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 2)

      assert.equal(results[0].kind, TokenType.Link)
      const mention = results[0] as HyperlinkMatch

      assert.equal(mention.text, '@shiftkey')
      assert.equal(mention.url, expectedUri)

      assert.equal(results[1].kind, TokenType.Text)
      assert.equal(results[1].text, ' was here')
    })

    it('renders mention when token found', () => {
      const expectedUri = `${host}/${login}`
      const text = `fixed based on suggestion from @${login}`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 2)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'fixed based on suggestion from ')

      assert.equal(results[1].kind, TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      assert.equal(mention.text, '@shiftkey')
      assert.equal(mention.url, expectedUri)
    })

    it('ignores http prefix when no text after', () => {
      const text = `fix double http:// in avatar URLs`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'fix double http:// in avatar URLs')
    })

    it('ignores https prefix when no text after', () => {
      const text = `fix double https:// in avatar URLs`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'fix double https:// in avatar URLs')
    })

    it('renders link when an issue reference is found', () => {
      const id = 955
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `Merge pull request #955 from desktop/computering-icons-for-all`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 3)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'Merge pull request ')

      assert.equal(results[1].kind, TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      assert.equal(mention.text, '#955')
      assert.equal(mention.url, expectedUri)

      assert.equal(results[2].kind, TokenType.Text)
      assert.equal(results[2].text, ' from desktop/computering-icons-for-all')
    })

    it('renders link when squash and merge', () => {
      const id = 5203
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `Update README.md (#5203)`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 3)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'Update README.md (')

      assert.equal(results[1].kind, TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      assert.equal(mention.text, '#5203')
      assert.equal(mention.url, expectedUri)

      assert.equal(results[2].kind, TokenType.Text)
      assert.equal(results[2].text, ')')
    })

    it('renders link and author mention when parsing release notes', () => {
      const id = 5348
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `'Clone repository' menu item label is obscured on Windows - #5348. Thanks @Daniel-McCarthy!`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 5)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(
        results[0].text,
        `'Clone repository' menu item label is obscured on Windows - `
      )

      assert.equal(results[1].kind, TokenType.Link)
      const issueLink = results[1] as HyperlinkMatch

      assert.equal(issueLink.text, '#5348')
      assert.equal(issueLink.url, expectedUri)

      assert.equal(results[2].kind, TokenType.Text)
      assert.equal(results[2].text, '. Thanks ')

      assert.equal(results[3].kind, TokenType.Link)
      const userLink = results[3] as HyperlinkMatch

      assert.equal(userLink.text, '@Daniel-McCarthy')
      assert.equal(userLink.url, 'https://github.com/Daniel-McCarthy')

      assert.equal(results[4].kind, TokenType.Text)
      assert.equal(results[4].text, `!`)
    })

    it('renders multiple issue links and mentions', () => {
      const firstId = 3174
      const firstExpectedUrl = `${htmlURL}/issues/${firstId}`
      const secondId = 3184
      const secondExpectedUrl = `${htmlURL}/issues/${secondId}`
      const thirdId = 3207
      const thirdExpectedUrl = `${htmlURL}/issues/${thirdId}`
      const text =
        'Assorted changelog typos - #3174 #3184 #3207. Thanks @strafe, @alanaasmaa and @jt2k!'

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 13)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'Assorted changelog typos - ')

      assert.equal(results[1].kind, TokenType.Link)
      const firstIssueLink = results[1] as HyperlinkMatch

      assert.equal(firstIssueLink.text, '#3174')
      assert.equal(firstIssueLink.url, firstExpectedUrl)

      assert.equal(results[2].kind, TokenType.Text)
      assert.equal(results[2].text, ' ')

      assert.equal(results[3].kind, TokenType.Link)
      const secondIssueLink = results[3] as HyperlinkMatch

      assert.equal(secondIssueLink.text, '#3184')
      assert.equal(secondIssueLink.url, secondExpectedUrl)

      assert.equal(results[4].kind, TokenType.Text)
      assert.equal(results[4].text, ' ')

      assert.equal(results[5].kind, TokenType.Link)
      const thirdIssueLink = results[5] as HyperlinkMatch

      assert.equal(thirdIssueLink.text, '#3207')
      assert.equal(thirdIssueLink.url, thirdExpectedUrl)

      assert.equal(results[6].kind, TokenType.Text)
      assert.equal(results[6].text, '. Thanks ')

      assert.equal(results[7].kind, TokenType.Link)
      const firstUserLink = results[7] as HyperlinkMatch

      assert.equal(firstUserLink.text, '@strafe')
      assert.equal(firstUserLink.url, 'https://github.com/strafe')

      assert.equal(results[8].kind, TokenType.Text)
      assert.equal(results[8].text, ', ')

      assert.equal(results[9].kind, TokenType.Link)
      const secondUserLink = results[9] as HyperlinkMatch

      assert.equal(secondUserLink.text, '@alanaasmaa')
      assert.equal(secondUserLink.url, 'https://github.com/alanaasmaa')

      assert.equal(results[10].kind, TokenType.Text)
      assert.equal(results[10].text, ' and ')

      assert.equal(results[11].kind, TokenType.Link)
      const thirdUserLink = results[11] as HyperlinkMatch

      assert.equal(thirdUserLink.text, '@jt2k')
      assert.equal(thirdUserLink.url, 'https://github.com/jt2k')

      assert.equal(results[12].kind, TokenType.Text)
      assert.equal(results[12].text, `!`)
    })

    it('renders multiple issue links and mentions even with commas', () => {
      const firstId = 3174
      const firstExpectedUrl = `${htmlURL}/issues/${firstId}`
      const secondId = 3184
      const secondExpectedUrl = `${htmlURL}/issues/${secondId}`
      const thirdId = 3207
      const thirdExpectedUrl = `${htmlURL}/issues/${thirdId}`
      const text =
        'Assorted changelog typos - #3174, #3184 & #3207. Thanks @strafe, @alanaasmaa, and @jt2k!'

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 13)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'Assorted changelog typos - ')

      assert.equal(results[1].kind, TokenType.Link)
      const firstIssueLink = results[1] as HyperlinkMatch

      assert.equal(firstIssueLink.text, '#3174')
      assert.equal(firstIssueLink.url, firstExpectedUrl)

      assert.equal(results[2].kind, TokenType.Text)
      assert.equal(results[2].text, ', ')

      assert.equal(results[3].kind, TokenType.Link)
      const secondIssueLink = results[3] as HyperlinkMatch

      assert.equal(secondIssueLink.text, '#3184')
      assert.equal(secondIssueLink.url, secondExpectedUrl)

      assert.equal(results[4].kind, TokenType.Text)
      assert.equal(results[4].text, ' & ')

      assert.equal(results[5].kind, TokenType.Link)
      const thirdIssueLink = results[5] as HyperlinkMatch

      assert.equal(thirdIssueLink.text, '#3207')
      assert.equal(thirdIssueLink.url, thirdExpectedUrl)

      assert.equal(results[6].kind, TokenType.Text)
      assert.equal(results[6].text, '. Thanks ')

      assert.equal(results[7].kind, TokenType.Link)
      const firstUserLink = results[7] as HyperlinkMatch

      assert.equal(firstUserLink.text, '@strafe')
      assert.equal(firstUserLink.url, 'https://github.com/strafe')

      assert.equal(results[8].kind, TokenType.Text)
      assert.equal(results[8].text, ', ')

      assert.equal(results[9].kind, TokenType.Link)
      const secondUserLink = results[9] as HyperlinkMatch

      assert.equal(secondUserLink.text, '@alanaasmaa')
      assert.equal(secondUserLink.url, 'https://github.com/alanaasmaa')

      assert.equal(results[10].kind, TokenType.Text)
      assert.equal(results[10].text, ', and ')

      assert.equal(results[11].kind, TokenType.Link)
      const thirdUserLink = results[11] as HyperlinkMatch

      assert.equal(thirdUserLink.text, '@jt2k')
      assert.equal(thirdUserLink.url, 'https://github.com/jt2k')

      assert.equal(results[12].kind, TokenType.Text)
      assert.equal(results[12].text, `!`)
    })

    it('converts full URL to issue shorthand', () => {
      const text = `Note: we keep a "denylist" of authentication methods for which we do
not want to enable http.emptyAuth automatically. An allowlist would be
nicer, but less robust, as we want to support linking to several cURL
versions and the list of authentication methods (as well as their names)
changed over time.

[jes: actually added the "auto" handling, excluded Digest, too]

This fixes https://github.com/shiftkey/some-repo/issues/1034

Signed-off-by: Johannes Schindelin <johannes.schindelin@gmx.de>`

      const expectedBefore = `Note: we keep a "denylist" of authentication methods for which we do
not want to enable http.emptyAuth automatically. An allowlist would be
nicer, but less robust, as we want to support linking to several cURL
versions and the list of authentication methods (as well as their names)
changed over time.

[jes: actually added the "auto" handling, excluded Digest, too]

This fixes `

      const expectedAfter = `

Signed-off-by: Johannes Schindelin <johannes.schindelin@gmx.de>`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)

      assert.equal(results.length, 3)

      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, expectedBefore)

      assert.equal(results[1].kind, TokenType.Link)
      const issue = results[1] as HyperlinkMatch

      assert.equal(issue.text, '#1034')
      assert.equal(
        issue.url,
        'https://github.com/shiftkey/some-repo/issues/1034'
      )

      assert.equal(results[2].kind, TokenType.Text)
      assert.equal(results[2].text, expectedAfter)
    })
  })

  describe('with non-GitHub repository', () => {
    it('renders an emoji match', () => {
      const text = 'releasing the thing :shipit:'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 2)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, 'releasing the thing ')

      assert.equal(results[1].kind, TokenType.Emoji)
      const match = results[1] as EmojiMatch

      assert.equal(match.text, ':shipit:')
      assert.equal(match.path, '/some/path.png')
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, text)
    })

    it('does not render link for mention', () => {
      const text = 'fixed based on suggestion from @shiftkey'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, text)
    })

    it('does not render link for issue reference', () => {
      const text =
        'Merge pull request #955 from desktop/computering-icons-for-all'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      assert.equal(results.length, 1)
      assert.equal(results[0].kind, TokenType.Text)
      assert.equal(results[0].text, text)
    })

    it('renders plain link for full URL', () => {
      const text = `Note: we keep a "denylist" of authentication methods for which we do
not want to enable http.emptyAuth automatically. An allowlist would be
nicer, but less robust, as we want to support linking to several cURL
versions and the list of authentication methods (as well as their names)
changed over time.

[jes: actually added the "auto" handling, excluded Digest, too]

This fixes https://github.com/shiftkey/some-repo/issues/1034

Signed-off-by: Johannes Schindelin <johannes.schindelin@gmx.de>`

      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)

      // other tests are looking at the newline formatting here
      // let's just verify the URL conversion works
      assert.equal(results.length, 3)

      assert.equal(results[1].kind, TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      assert.equal(
        mention.text,
        'https://github.com/shiftkey/some-repo/issues/1034'
      )
      assert.equal(
        mention.url,
        'https://github.com/shiftkey/some-repo/issues/1034'
      )
    })
  })
})
