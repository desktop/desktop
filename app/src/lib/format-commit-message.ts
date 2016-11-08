import { ICommitMessage } from './dispatcher/git-store'

/**
 * Formats a summary and a description into a git-friendly
 * commit message where the summary and (optional) description
 * is separated by a blank line.
 *
 * See https://git-scm.com/docs/git-commit#_discussion
 */
export function formatCommitMessage(message: ICommitMessage) {
  let msg = message.summary
  if (message.description) {
    msg += `\n\n${message.description}`
  }

  return msg
}
