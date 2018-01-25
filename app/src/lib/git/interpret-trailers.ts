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

export async function addTrailers(
  repository: Repository,
  commitMessage: string,
  trailers: ReadonlyArray<ITrailer>
) {
  const trailerArgs = []

  for (const trailer of trailers) {
    trailerArgs.push('--trailer', `${trailer.key}:${trailer.value}`)
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
        p.stdin.end(commitMessage)
      },
    }
  )

  return result.stdout
}
