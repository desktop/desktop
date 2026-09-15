import { git } from './core'
import { Repository } from '../../models/repository'
import { getConfigValue } from './config'

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

/**
 * Get a string containing the characters that may be used in this repository
 * separate tokens from values in commit message trailers. If no specific
 * trailer separator is configured the default separator (:) will be returned.
 */
export async function getTrailerSeparatorCharacters(
  repository: Repository
): Promise<string> {
  return (await getConfigValue(repository, 'trailer.separators')) || ':'
}

/**
 * Extract commit message trailers from a commit message.
 *
 * The trailers returned here are unfolded, i.e. they've had their
 * whitespace continuation removed and are all on one line. See the
 * documentation for --unfold in the help for `git interpret-trailers`
 *
 * @param repository    The repository in which to run the interpret-
 *                      trailers command. Although not intuitive this
 *                      does matter as there are configuration options
 *                      available for the format, position, etc of commit
 *                      message trailers. See the manpage for
 *                      git-interpret-trailers for more information.
 *
 * @param commitMessage A commit message from where to attempt to extract
 *                      commit message trailers.
 *
 * @returns An array of zero or more parsed trailers
 */
export async function parseTrailers(
  repository: Repository,
  commitMessage: string
): Promise<ReadonlyArray<ITrailer>> {
  const result = await git(
    ['interpret-trailers', '--parse'],
    repository.path,
    'parseTrailers',
    {
      stdin: commitMessage,
    }
  )

  const trailers = result.stdout

  if (trailers.length === 0) {
    return []
  }

  const separators = await getTrailerSeparatorCharacters(repository)
  return parseRawUnfoldedTrailers(result.stdout, separators)
}

/**
 * Merge one or more commit message trailers into a commit message.
 *
 * If no trailers are given this method will simply try to ensure that
 * any trailers that happen to be part of the raw message are formatted
 * in accordance with the configuration options set for trailers in
 * the given repository.
 *
 * Note that configuration may be set so that duplicate trailers are
 * kept or discarded.
 *
 * @param repository    The repository in which to run the interpret-
 *                      trailers command. Although not intuitive this
 *                      does matter as there are configuration options
 *                      available for the format, position, etc of commit
 *                      message trailers. See the manpage for
 *                      git-interpret-trailers for more information.
 *
 * @param commitMessage A commit message with or without existing commit
 *                      message trailers into which to merge the trailers
 *                      given in the trailers parameter
 *
 * @param trailers      Zero or more trailers to merge into the commit message
 *
 * @returns             A commit message string where the provided trailers (if)
 *                      any have been merged into the commit message using the
 *                      configuration settings for trailers in the provided
 *                      repository.
 */
export async function mergeTrailers(
  repository: Repository,
  commitMessage: string,
  trailers: ReadonlyArray<ITrailer>,
  unfold: boolean = false
) {
  const args = ['interpret-trailers']

  // See https://github.com/git/git/blob/ebf3c04b262aa/Documentation/git-interpret-trailers.txt#L129-L132
  args.push('--no-divider')

  if (unfold) {
    args.push('--unfold')
  }

  for (const trailer of trailers) {
    args.push('--trailer', `${trailer.token}=${trailer.value}`)
  }

  const result = await git(args, repository.path, 'mergeTrailers', {
    stdin: commitMessage,
  })

  return result.stdout
}
