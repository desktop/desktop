/**
 * A representation of a Git commit message trailer.
 *
 * See git-interpret-trailers for more information.
 */
export interface ITrailer {
  readonly token: string
  readonly value: string
}

/**
 * Gets a value indicating whether the trailer token is
 * Co-Authored-By. Does not validate the token value.
 */
export function isCoAuthoredByTrailer(trailer: ITrailer) {
  return trailer.token.toLowerCase() === 'co-authored-by'
}

/**
 * Parse a string containing only unfolded trailers produced by
 * git-interpret-trailers --only-input --only-trailers --unfold or
 * a derivative such as git log --format="%(trailers:only,unfold)"
 *
 * @param trailers   A string containing one well formed trailer per
 *                   line
 *
 * @param separators A string containing all characters to use when
 *                   attempting to find the separator between token
 *                   and value in a trailer. See the configuration
 *                   option trailer.separators for more information
 *
 *                   Also see getTrailerSeparatorCharacters.
 */
export function parseRawUnfoldedTrailers(trailers: string, separators: string) {
  const lines = trailers.split('\n')
  const parsedTrailers = new Array<ITrailer>()

  for (const line of lines) {
    const trailer = parseSingleUnfoldedTrailer(line, separators)

    if (trailer) {
      parsedTrailers.push(trailer)
    }
  }

  return parsedTrailers
}

export function parseSingleUnfoldedTrailer(
  line: string,
  separators: string
): ITrailer | null {
  for (const separator of separators) {
    const ix = line.indexOf(separator)
    if (ix > 0) {
      return {
        token: line.substring(0, ix).trim(),
        value: line.substring(ix + 1).trim(),
      }
    }
  }

  return null
}
