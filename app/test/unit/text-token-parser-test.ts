import { expect } from 'chai'

import {
  Tokenizer,
  TokenType,
  EmojiMatch,
  HyperlinkMatch,
} from '../../src/lib/text-token-parser'
import { GitHubRepository } from '../../src/models/github-repository'
import { Repository } from '../../src/models/repository'

const emoji = new Map<string, string>([[':shipit:', '/some/path.png']])

describe('Tokenizer', () => {
  describe('basic tests', () => {
    it('preserves plain text string', () => {
      const text = 'this is a string without anything interesting'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal(text)
    })

    it('returns emoji between two string elements', () => {
      const text = "let's :shipit: this thing"
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(3)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal("let's ")
      expect(results[1].kind).to.equal(TokenType.Emoji)
      expect(results[1].text).to.equal(':shipit:')
      expect(results[2].kind).to.equal(TokenType.Text)
      expect(results[2].text).to.equal(' this thing')
    })
  })

  describe('with GitHub repository', () => {
    const host = 'https://github.com'
    const endpoint = 'https://api.github.com'
    const login = 'shiftkey'
    const name = 'some-repo'
    const htmlURL = `${host}/${login}/${name}`
    const cloneURL = `${host}/${login}/${name}.git`

    let gitHubRepository: GitHubRepository | null = null
    gitHubRepository = {
      dbID: 1,
      name,
      owner: {
        endpoint,
        login,
        hash: '',
        id: null,
      },
      cloneURL,
      endpoint: 'https://api.github.com',
      fullName: `${login}/${name}`,
      private: false,
      fork: false,
      htmlURL: htmlURL,
      defaultBranch: 'master',
      hash: '',
      parent: null,
    }

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
      expect(results.length).to.equal(2)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal('releasing the thing ')

      expect(results[1].kind).to.equal(TokenType.Emoji)
      const match = results[1] as EmojiMatch

      expect(match.text).to.equal(':shipit:')
      expect(match.path).to.equal('/some/path.png')
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal('releasing the thing :unknown:')
    })

    it('does not render link when email address found', () => {
      const text = 'the email address support@github.com should be ignored'
      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal(
        'the email address support@github.com should be ignored'
      )
    })

    it('render mention when text starts with a @', () => {
      const expectedUri = `${host}/${login}`
      const text = `@${login} was here`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(2)

      expect(results[0].kind).to.equal(TokenType.Link)
      const mention = results[0] as HyperlinkMatch

      expect(mention.text).to.equal('@shiftkey')
      expect(mention.url).to.equal(expectedUri)

      expect(results[1].kind).to.equal(TokenType.Text)
      expect(results[1].text).to.equal(' was here')
    })

    it('renders mention when token found', () => {
      const expectedUri = `${host}/${login}`
      const text = `fixed based on suggestion from @${login}`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(2)

      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal('fixed based on suggestion from ')

      expect(results[1].kind).to.equal(TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      expect(mention.text).to.equal('@shiftkey')
      expect(mention.url).to.equal(expectedUri)
    })

    it('ignores http prefix when no text after', () => {
      const text = `fix double http:// in avatar URLs`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)

      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal('fix double http:// in avatar URLs')
    })

    it('ignores https prefix when no text after', () => {
      const text = `fix double https:// in avatar URLs`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)

      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal('fix double https:// in avatar URLs')
    })

    it('renders link when an issue reference is found', () => {
      const id = 955
      const expectedUri = `${htmlURL}/issues/${id}`
      const text = `Merge pull request #955 from desktop/computering-icons-for-all`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(3)

      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal('Merge pull request ')

      expect(results[1].kind).to.equal(TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      expect(mention.text).to.equal('#955')
      expect(mention.url).to.equal(expectedUri)

      expect(results[2].kind).to.equal(TokenType.Text)
      expect(results[2].text).to.equal(
        ' from desktop/computering-icons-for-all'
      )
    })

    it('converts full URL to issue shorthand', () => {
      const text = `Note: we keep a "black list" of authentication methods for which we do
not want to enable http.emptyAuth automatically. A white list would be
nicer, but less robust, as we want to support linking to several cURL
versions and the list of authentication methods (as well as their names)
changed over time.

[jes: actually added the "auto" handling, excluded Digest, too]

This fixes https://github.com/shiftkey/some-repo/issues/1034

Signed-off-by: Johannes Schindelin <johannes.schindelin@gmx.de>`

      const expectedBefore = `Note: we keep a "black list" of authentication methods for which we do
not want to enable http.emptyAuth automatically. A white list would be
nicer, but less robust, as we want to support linking to several cURL
versions and the list of authentication methods (as well as their names)
changed over time.

[jes: actually added the "auto" handling, excluded Digest, too]

This fixes `

      const expectedAfter = `

Signed-off-by: Johannes Schindelin <johannes.schindelin@gmx.de>`

      const tokenizer = new Tokenizer(emoji, repository)
      const results = tokenizer.tokenize(text)

      expect(results.length).to.equal(3)

      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal(expectedBefore)

      expect(results[1].kind).to.equal(TokenType.Link)
      const issue = results[1] as HyperlinkMatch

      expect(issue.text).to.equal('#1034')
      expect(issue.url).to.equal(
        'https://github.com/shiftkey/some-repo/issues/1034'
      )

      expect(results[2].kind).to.equal(TokenType.Text)
      expect(results[2].text).to.equal(expectedAfter)
    })
  })

  describe('with non-GitHub repository', () => {
    it('renders an emoji match', () => {
      const text = 'releasing the thing :shipit:'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(2)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal('releasing the thing ')

      expect(results[1].kind).to.equal(TokenType.Emoji)
      const match = results[1] as EmojiMatch

      expect(match.text).to.equal(':shipit:')
      expect(match.path).to.equal('/some/path.png')
    })

    it('skips emoji when no match exists', () => {
      const text = 'releasing the thing :unknown:'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal(text)
    })

    it('does not render link for mention', () => {
      const text = 'fixed based on suggestion from @shiftkey'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal(text)
    })

    it('does not render link for issue reference', () => {
      const text =
        'Merge pull request #955 from desktop/computering-icons-for-all'
      const tokenizer = new Tokenizer(emoji)
      const results = tokenizer.tokenize(text)
      expect(results.length).to.equal(1)
      expect(results[0].kind).to.equal(TokenType.Text)
      expect(results[0].text).to.equal(text)
    })

    it('renders plain link for full URL', () => {
      const text = `Note: we keep a "black list" of authentication methods for which we do
not want to enable http.emptyAuth automatically. A white list would be
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
      expect(results.length).to.equal(3)

      expect(results[1].kind).to.equal(TokenType.Link)
      const mention = results[1] as HyperlinkMatch

      expect(mention.text).to.equal(
        'https://github.com/shiftkey/some-repo/issues/1034'
      )
      expect(mention.url).to.equal(
        'https://github.com/shiftkey/some-repo/issues/1034'
      )
    })
  })
})
