import { git, IGitExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { getConfigValue } from './config'

import {
  ITrailer,
  parseRawUnfoldedTrailers,
} from '../../../../rust/web/src/upstream/trailers'
export {
  ITrailer,
  isCoAuthoredByTrailer,
  parseRawUnfoldedTrailers,
  parseSingleUnfoldedTrailer,
} from '../../../../rust/web/src/upstream/trailers'

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
  unfold: boolean = false,
  options?: Pick<IGitExecutionOptions, 'env'>
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
    ...options,
    stdin: commitMessage,
  })

  return result.stdout
}
