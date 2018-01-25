import { ITrailer, mergeTrailers } from './git/interpret-trailers'
import { Repository } from '../models/repository'

/**
 * Formats a summary and a description into a git-friendly
 * commit message where the summary and (optional) description
 * is separated by a blank line.
 *
 * See https://git-scm.com/docs/git-commit#_discussion
 */
export async function formatCommitMessage(
  repository: Repository,
  summary: string,
  description: string | null,
  trailers?: ReadonlyArray<ITrailer>
) {
  const message = `${summary}\n\n${description || ''}\n`.replace(/\s+$/, '\n')

  return trailers !== undefined && trailers.length > 0
    ? mergeTrailers(repository, message, trailers)
    : message
}
