import { git } from './core'
import { Repository } from '../../models/repository'

export interface ITrailer {
  key: string
  value: string
}

/**
 * Extract commit message trailers from a commit message
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
      // This is working around a bug in dugite where
      // you can't send empty strings over stdin using
      // the stdin parameter.
      // See http://github.com/desktop/dugite/pull/163
      processCallback: p => {
        p.stdin.end(commitMessage)
      },
    }
  )

  return result.stdout.split('\n').map(l => {
    const parts = l.split(': ', 2)
    return {
      key: parts[0],
      value: parts[1],
    }
  })
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
 * @param commitMessage A commit message with or withot existing commit
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
  trailers: ReadonlyArray<ITrailer>
) {
  const trailerArgs = []

  for (const trailer of trailers) {
    trailerArgs.push('--trailer', `${trailer.key}=${trailer.value}`)
  }

  const result = await git(
    ['interpret-trailers', ...trailerArgs],
    repository.path,
    'addTrailers',
    {
      processCallback: p => {
        // This is working around a bug in dugite where
        // you can't send empty strings over stdin using
        // the stdin parameter.
        // See http://github.com/desktop/dugite/pull/163
        p.stdin.end(commitMessage)
      },
    }
  )

  return result.stdout
}
