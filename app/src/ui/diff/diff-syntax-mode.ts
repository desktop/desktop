import { ITokens } from '../../lib/highlighter/types'

/**
 * Attempt to get tokens for a particular diff line. This will attempt
 * to look up tokens in both the old tokens and the new which is
 * important because for context lines we might only have tokens in
 * one version and we need to be resilient about that.
 */
export function getTokens(
  lineNumber: number | null,
  tokens: ITokens | undefined
) {
  // Note: Diff lines numbers start at one so we adjust this in order
  // to get the line _index_ in the before or after file contents.
  if (
    tokens !== undefined &&
    lineNumber !== null &&
    tokens[lineNumber - 1] !== undefined
  ) {
    return tokens[lineNumber - 1]
  }

  return null
}
