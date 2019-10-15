import { mergeTrailers } from './git/interpret-trailers'
import { Repository } from '../models/repository'
import { ICommitContext } from '../models/commit'

/**
 * Formats a summary and a description into a git-friendly
 * commit message where the summary and (optional) description
 * is separated by a blank line.
 *
 * Also accepts an optional array of commit message trailers,
 * see git-interpret-trailers which, if present, will be merged
 * into the commit message.
 *
 * Always returns commit message with a trailing newline
 *
 * See https://git-scm.com/docs/git-commit#_discussion
 */
export async function formatCommitMessage(
  repository: Repository,
  context: ICommitContext
) {
  const { summary, description, trailers } = context

  // Git always trim whitespace at the end of commit messages
  // so we concatenate the summary with the description, ensuring
  // that they're separated by two newlines. If we don't have a
  // description or if it consists solely of whitespace that'll
  // all get trimmed away and replaced with a single newline (since
  // all commit messages needs to end with a newline for git
  // interpret-trailers to work)
  const message = `${summary}\n\n${description || ''}\n`.replace(/\s+$/, '\n')

  return trailers !== undefined && trailers.length > 0
    ? mergeTrailers(repository, message, trailers)
    : message
}
