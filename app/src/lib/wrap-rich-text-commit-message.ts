import {
  Tokenizer,
  TokenType,
  TokenResult,
  PlainText,
  HyperlinkMatch,
} from './text-token-parser'
import { assertNever } from './fatal-error'

const MaxSummaryLength = 72

/**
 * A method used to wrap long commit summaries and put any overflow
 * into the commit body while taking rich text into consideration.
 *
 * See https://github.com/desktop/desktop/issues/9185 for a description
 * of the problem and https://github.com/desktop/desktop/pull/2575 for
 * the initial naive implementation.
 *
 * Note that this method doesn't wrap multibyte chars like unicode emojis
 * correctly (i.e. it could end up splitting a multibyte char).
 *
 * @param summaryText The commit message summary text (i.e. the first line)
 * @param bodyText    The commit message body text
 * @param tokenizer   The tokenizer to use when converting the raw text to
 *                    rich text tokens
 * @param maxSummaryLength  The maximum width of the commit summary (defaults
 *                          to 72), note that this does not include any ellipsis
 *                          that may be appended when wrapping. In other words
 *                          it's possible that the commit summary ends up being
 *                          maxSummaryLength + 1 long when rendered.
 */
export function wrapRichTextCommitMessage(
  summaryText: string,
  bodyText: string,
  tokenizer: Tokenizer,
  maxSummaryLength = MaxSummaryLength
): { summary: ReadonlyArray<TokenResult>; body: ReadonlyArray<TokenResult> } {
  const tokens = tokenizer.tokenize(summaryText.trimRight())

  const summary = new Array<TokenResult>()
  const overflow = new Array<TokenResult>()

  let remainder = maxSummaryLength

  for (const token of tokens) {
    // An emoji token like ":white_square_button: would still only take
    // up a little bit more space than a regular character when rendered
    // as an image, we take that into consideration here with an approximation
    // that an emoji is twice as wide as a normal character.
    const charCount = token.kind === TokenType.Emoji ? 2 : token.text.length

    if (remainder <= 0) {
      // There's no room left in the summary, everything needs to
      // go into the overflow
      overflow.push(token)
    } else if (remainder >= charCount) {
      // The token fits without us having to think about wrapping!
      summary.push(token)
      remainder -= charCount
    } else {
      // There's not enough room to include the token in its entirety,
      // we've got to make a decision between hard wrapping or pushing
      // to overflow.
      if (token.kind === TokenType.Text) {
        // We always hard-wrap text, it'd be nice if we could attempt
        // to break at word boundaries in the future but that's too
        // complex for now.
        summary.push(text(token.text.substr(0, remainder)))
        overflow.push(text(token.text.substr(remainder)))
      } else if (token.kind === TokenType.Emoji) {
        // Can't hard-wrap inside an emoji
        overflow.push(token)
      } else if (token.kind === TokenType.Link) {
        // Hard wrapping an issue link is confusing so we treat them
        // as atomic. For all other links (@mentions or https://...)
        // We want at least the first couple of characters of the link
        // text showing otherwise we'll end up with weird links like "h"
        // or "@"
        if (!token.text.startsWith('#') && remainder > 5) {
          summary.push(link(token.text.substr(0, remainder), token.text))
          overflow.push(link(token.text.substr(remainder), token.text))
        } else {
          overflow.push(token)
        }
      } else {
        return assertNever(token, `Unknown token type`)
      }

      remainder = 0
    }
  }

  let body = tokenizer.tokenize(bodyText.trimRight())

  if (overflow.length > 0) {
    summary.push(ellipsis())
    if (body.length > 0) {
      body = [ellipsis(), ...overflow, text('\n\n'), ...body]
    } else {
      body = [ellipsis(), ...overflow]
    }
  }

  return { summary, body }
}

function ellipsis() {
  return text('…')
}
function text(text: string): PlainText {
  return { kind: TokenType.Text, text }
}
function link(text: string, url: string): HyperlinkMatch {
  return { kind: TokenType.Link, text, url }
}
