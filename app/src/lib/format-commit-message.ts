import { ITrailer, mergeTrailers } from './git/interpret-trailers'
import { Repository } from '../models/repository'

function joinSummaryAndDescription(summary: string, description: string) {
  return `${summary}\n\n${description}\n`.replace(/\s+$/, '\n')
}

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
  const message =
    description === null || description.length === 0
      ? summary
      : joinSummaryAndDescription(summary, description)

  return trailers !== undefined && trailers.length > 0
    ? mergeTrailers(repository, message, trailers)
    : message
}
