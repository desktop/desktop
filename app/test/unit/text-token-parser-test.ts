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
      expect(results).toHaveLength(1)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe(text)
    })

    it('returns emoji between two string elements', () => {
      const text = "let's :shipit: this thing"
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(3)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe("let's ")
      expect(results[1].kind).toBe(TokenType.Emoji)
      expect(results[1].text).toBe(':shipit:')
      expect(results[2].kind).toBe(TokenType.Text)
      expect(results[2].text).toBe(' this thing')
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
      expect(results).toHaveLength(2)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('releasing the thing ')

      expect(results[1].kind).toBe(TokenType.Emoji)
      const match = results[1] as EmojiMatch

      expect(match.text).toBe(':shipit:')
      expect(match.path).toBe('/some/path.png')
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(1)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('releasing the thing :unknown:')
    })

    it('does not render link when email address found', () => {
      const text = 'the email address support@github.com should be ignored'
      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(1)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe(
        'the email address support@github.com should be ignored'
      )
    })

    it('render mention when text starts with a @', () => {
      const expectedUri = `${host}/${login}`
      const text = `@${login} was here`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(2)

      expect(results[0].kind).toBe(TokenType.Link)
      const mention = results[0] as HyperlinkMatch

      expect(mention.text).toBe('@shiftkey')
      expect(mention.url).toBe(expectedUri)

      expect(results[1].kind).toBe(TokenType.Text)
      expect(results[1].text).toBe(' was here')
    })

    it('renders mention when token found', () => {
      const expectedUri = `${host}/${login}`
      const text = `fixed based on suggestion from @${login}`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(2)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('fixed based on suggestion from ')

      expect(results[1].kind).toBe(TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      expect(mention.text).toBe('@shiftkey')
      expect(mention.url).toBe(expectedUri)
    })

    it('ignores http prefix when no text after', () => {
      const text = `fix double http:// in avatar URLs`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(1)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('fix double http:// in avatar URLs')
    })

    it('ignores https prefix when no text after', () => {
      const text = `fix double https:// in avatar URLs`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(1)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('fix double https:// in avatar URLs')
    })

    it('renders link when an issue reference is found', () => {
      const id = 955
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `Merge pull request #955 from desktop/computering-icons-for-all`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(3)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('Merge pull request ')

      expect(results[1].kind).toBe(TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      expect(mention.text).toBe('#955')
      expect(mention.url).toBe(expectedUri)

      expect(results[2].kind).toBe(TokenType.Text)
      expect(results[2].text).toBe(' from desktop/computering-icons-for-all')
    })

    it('renders link when squash and merge', () => {
      const id = 5203
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `Update README.md (#5203)`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(3)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('Update README.md (')

      expect(results[1].kind).toBe(TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      expect(mention.text).toBe('#5203')
      expect(mention.url).toBe(expectedUri)

      expect(results[2].kind).toBe(TokenType.Text)
      expect(results[2].text).toBe(')')
    })

    it('renders link and author mention when parsing release notes', () => {
      const id = 5348
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `'Clone repository' menu item label is obscured on Windows - #5348. Thanks @Daniel-McCarthy!`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(5)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe(
        `'Clone repository' menu item label is obscured on Windows - `
      )

      expect(results[1].kind).toBe(TokenType.Link)
      const issueLink = results[1] as HyperlinkMatch

      expect(issueLink.text).toBe('#5348')
      expect(issueLink.url).toBe(expectedUri)

      expect(results[2].kind).toBe(TokenType.Text)
      expect(results[2].text).toBe('. Thanks ')

      expect(results[3].kind).toBe(TokenType.Link)
      const userLink = results[3] as HyperlinkMatch

      expect(userLink.text).toBe('@Daniel-McCarthy')
      expect(userLink.url).toBe('https://github.com/Daniel-McCarthy')

      expect(results[4].kind).toBe(TokenType.Text)
      expect(results[4].text).toBe(`!`)
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
      expect(results).toHaveLength(13)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('Assorted changelog typos - ')

      expect(results[1].kind).toBe(TokenType.Link)
      const firstIssueLink = results[1] as HyperlinkMatch

      expect(firstIssueLink.text).toBe('#3174')
      expect(firstIssueLink.url).toBe(firstExpectedUrl)

      expect(results[2].kind).toBe(TokenType.Text)
      expect(results[2].text).toBe(' ')

      expect(results[3].kind).toBe(TokenType.Link)
      const secondIssueLink = results[3] as HyperlinkMatch

      expect(secondIssueLink.text).toBe('#3184')
      expect(secondIssueLink.url).toBe(secondExpectedUrl)

      expect(results[4].kind).toBe(TokenType.Text)
      expect(results[4].text).toBe(' ')

      expect(results[5].kind).toBe(TokenType.Link)
      const thirdIssueLink = results[5] as HyperlinkMatch

      expect(thirdIssueLink.text).toBe('#3207')
      expect(thirdIssueLink.url).toBe(thirdExpectedUrl)

      expect(results[6].kind).toBe(TokenType.Text)
      expect(results[6].text).toBe('. Thanks ')

      expect(results[7].kind).toBe(TokenType.Link)
      const firstUserLink = results[7] as HyperlinkMatch

      expect(firstUserLink.text).toBe('@strafe')
      expect(firstUserLink.url).toBe('https://github.com/strafe')

      expect(results[8].kind).toBe(TokenType.Text)
      expect(results[8].text).toBe(', ')

      expect(results[9].kind).toBe(TokenType.Link)
      const secondUserLink = results[9] as HyperlinkMatch

      expect(secondUserLink.text).toBe('@alanaasmaa')
      expect(secondUserLink.url).toBe('https://github.com/alanaasmaa')

      expect(results[10].kind).toBe(TokenType.Text)
      expect(results[10].text).toBe(' and ')

      expect(results[11].kind).toBe(TokenType.Link)
      const thirdUserLink = results[11] as HyperlinkMatch

      expect(thirdUserLink.text).toBe('@jt2k')
      expect(thirdUserLink.url).toBe('https://github.com/jt2k')

      expect(results[12].kind).toBe(TokenType.Text)
      expect(results[12].text).toBe(`!`)
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
      expect(results).toHaveLength(13)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('Assorted changelog typos - ')

      expect(results[1].kind).toBe(TokenType.Link)
      const firstIssueLink = results[1] as HyperlinkMatch

      expect(firstIssueLink.text).toBe('#3174')
      expect(firstIssueLink.url).toBe(firstExpectedUrl)

      expect(results[2].kind).toBe(TokenType.Text)
      expect(results[2].text).toBe(', ')

      expect(results[3].kind).toBe(TokenType.Link)
      const secondIssueLink = results[3] as HyperlinkMatch

      expect(secondIssueLink.text).toBe('#3184')
      expect(secondIssueLink.url).toBe(secondExpectedUrl)

      expect(results[4].kind).toBe(TokenType.Text)
      expect(results[4].text).toBe(' & ')

      expect(results[5].kind).toBe(TokenType.Link)
      const thirdIssueLink = results[5] as HyperlinkMatch

      expect(thirdIssueLink.text).toBe('#3207')
      expect(thirdIssueLink.url).toBe(thirdExpectedUrl)

      expect(results[6].kind).toBe(TokenType.Text)
      expect(results[6].text).toBe('. Thanks ')

      expect(results[7].kind).toBe(TokenType.Link)
      const firstUserLink = results[7] as HyperlinkMatch

      expect(firstUserLink.text).toBe('@strafe')
      expect(firstUserLink.url).toBe('https://github.com/strafe')

      expect(results[8].kind).toBe(TokenType.Text)
      expect(results[8].text).toBe(', ')

      expect(results[9].kind).toBe(TokenType.Link)
      const secondUserLink = results[9] as HyperlinkMatch

      expect(secondUserLink.text).toBe('@alanaasmaa')
      expect(secondUserLink.url).toBe('https://github.com/alanaasmaa')

      expect(results[10].kind).toBe(TokenType.Text)
      expect(results[10].text).toBe(', and ')

      expect(results[11].kind).toBe(TokenType.Link)
      const thirdUserLink = results[11] as HyperlinkMatch

      expect(thirdUserLink.text).toBe('@jt2k')
      expect(thirdUserLink.url).toBe('https://github.com/jt2k')

      expect(results[12].kind).toBe(TokenType.Text)
      expect(results[12].text).toBe(`!`)
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

      expect(results).toHaveLength(3)

      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe(expectedBefore)

      expect(results[1].kind).toBe(TokenType.Link)
      const issue = results[1] as HyperlinkMatch

      expect(issue.text).toBe('#1034')
      expect(issue.url).toBe(
        'https://github.com/shiftkey/some-repo/issues/1034'
      )

      expect(results[2].kind).toBe(TokenType.Text)
      expect(results[2].text).toBe(expectedAfter)
    })
  })

  describe('with non-GitHub repository', () => {
    it('renders an emoji match', () => {
      const text = 'releasing the thing :shipit:'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(2)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe('releasing the thing ')

      expect(results[1].kind).toBe(TokenType.Emoji)
      const match = results[1] as EmojiMatch

      expect(match.text).toBe(':shipit:')
      expect(match.path).toBe('/some/path.png')
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(1)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe(text)
    })

    it('does not render link for mention', () => {
      const text = 'fixed based on suggestion from @shiftkey'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(1)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe(text)
    })

    it('does not render link for issue reference', () => {
      const text =
        'Merge pull request #955 from desktop/computering-icons-for-all'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results).toHaveLength(1)
      expect(results[0].kind).toBe(TokenType.Text)
      expect(results[0].text).toBe(text)
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
      expect(results).toHaveLength(3)

      expect(results[1].kind).toBe(TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      expect(mention.text).toBe(
        'https://github.com/shiftkey/some-repo/issues/1034'
      )
      expect(mention.url).toBe(
        'https://github.com/shiftkey/some-repo/issues/1034'
      )
    })
  })
})
