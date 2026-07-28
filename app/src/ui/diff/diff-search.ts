import escapeRegExp from 'lodash/escapeRegExp'

/** A literal search match within the original content. */
export interface ILiteralMatch {
  /** The zero-based UTF-16 offset where the match starts. */
  readonly index: number

  /** The match length in UTF-16 code units. */
  readonly length: number
}

/**
 * Yields every non-overlapping, case-insensitive occurrence of a literal query
 * in content. Each result uses offsets and lengths from the original content.
 * An empty query yields no results.
 *
 * An escaped regular expression provides case-insensitive matching without
 * changing source offsets. Queries exceeding the regular expression engine's
 * size limit fall back to normalized string matching.
 */
export function* findLiteralMatches(
  content: string,
  query: string
): IterableIterator<ILiteralMatch> {
  if (query.length === 0) {
    return
  }

  try {
    const searchRe = new RegExp(escapeRegExp(query), 'gi')
    for (const match of content.matchAll(searchRe)) {
      if (match.index !== undefined) {
        yield { index: match.index, length: match[0].length }
      }
    }
    return
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }
  }

  const normalizedContent = content.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  let index = normalizedContent.indexOf(normalizedQuery)

  while (index !== -1) {
    yield { index, length: query.length }
    index = normalizedContent.indexOf(normalizedQuery, index + query.length)
  }
}
