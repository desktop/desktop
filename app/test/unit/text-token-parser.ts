import * as chai from 'chai'
const expect = chai.expect

import { Tokenizer, TokenType } from '../../src/lib/text-token-parser'

const tokenizer = new Tokenizer()

describe('simple parsing', () => {
  beforeEach(() => {
    tokenizer.reset()
  })

  it('preserves plain text string', () => {
    const text = 'this is a string without anything interesting'
    tokenizer.tokenize(text)
    const results = tokenizer.results
    expect(results.length).to.equal(1)
    expect(results[0].type).to.equal(TokenType.Text)
    expect(results[0].text).to.equal(text)
  })

  it('returns emoji between two string elements', () => {
    const text = 'let\'s :ship: this thing'
    tokenizer.tokenize(text)
    const results = tokenizer.results
    expect(results.length).to.equal(3)
    expect(results[0].type).to.equal(TokenType.Text)
    expect(results[0].text).to.equal('let\'s ')
    expect(results[1].type).to.equal(TokenType.Emoji)
    expect(results[1].text).to.equal(':ship:')
    expect(results[2].type).to.equal(TokenType.Text)
    expect(results[2].text).to.equal(' this thing')
  })

  it('renders a mention at the beginning', () => {
    const text = '@shiftkey was here'
    tokenizer.tokenize(text)
    const results = tokenizer.results
    expect(results.length).to.equal(2)
    expect(results[0].type).to.equal(TokenType.Mention)
    expect(results[0].text).to.equal('@shiftkey')
    expect(results[1].type).to.equal(TokenType.Text)
    expect(results[1].text).to.equal(' was here')
  })

  it('renders a mention', () => {
    const text = 'this one is for that @haacked fellow'
    tokenizer.tokenize(text)
    const results = tokenizer.results
    expect(results.length).to.equal(3)
    expect(results[0].type).to.equal(TokenType.Text)
    expect(results[0].text).to.equal('this one is for that ')
    expect(results[1].type).to.equal(TokenType.Mention)
    expect(results[1].text).to.equal('@haacked')
    expect(results[2].type).to.equal(TokenType.Text)
    expect(results[2].text).to.equal(' fellow')
  })

  it('preserves newlines', () => {
    const text = `Note: we keep a "black list" of authentication methods for which we do
not want to enable http.emptyAuth automatically. A white list would be
nicer, but less robust, as we want to support linking to several cURL
versions and the list of authentication methods (as well as their names)
changed over time.

[jes: actually added the "auto" handling, excluded Digest, too]

This fixes #1034

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

    tokenizer.tokenize(text)
    const results = tokenizer.results
    expect(results.length).to.equal(3)
    expect(results[0].type).to.equal(TokenType.Text)
    expect(results[0].text).to.equal(expectedBefore)
    expect(results[1].type).to.equal(TokenType.Issue)
    expect(results[1].text).to.equal('#1034')
    expect(results[2].type).to.equal(TokenType.Text)
    expect(results[2].text).to.equal(expectedAfter)
  })
})
