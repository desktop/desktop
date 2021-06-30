import { mergeTrailers } from './git/interpret-trailers'
import { Repository } from '../models/repository'
import { ICommitContext } from '../models/commit'

/**
 * Splits a commit description into lines of no more than
 * 72 characters.
 *
 * Strings are split into individual words (separated
 * by spaces) to ensure that the description is still
 * readable.
 *
 * @param description The unformatted description
 */
function formatDescription(description: string | null) {
  if (description == null) {
    return null
  }

  const result: string[] = []
  const splitDescription: string[] = description.split('\n')
  for (const line of splitDescription) {
    const allWords = line.split(' ')
    const lineResult: string[] = []
    let lineWords: string[] = []
    let wordsLength = 0

    for (const word of allWords) {
      const oldLineLength = wordsLength + lineWords.length
      const newLineLength = oldLineLength + word.length + 1
      if (newLineLength >= 72) {
        lineResult.push(lineWords.join(' '))
        lineWords = []
        wordsLength = 0
      }

      lineWords.push(word)
      wordsLength += word.length
    }
    lineResult.push(lineWords.join(' '))
    result.push(lineResult.join('\n'))
  }
  return result.join('\n')
}

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

  const formattedDescription = formatDescription(description)

  // Git always trim whitespace at the end of commit messages
  // so we concatenate the summary with the description, ensuring
  // that they're separated by two newlines. If we don't have a
  // description or if it consists solely of whitespace that'll
  // all get trimmed away and replaced with a single newline (since
  // all commit messages needs to end with a newline for git
  // interpret-trailers to work)
  const message = `${summary}\n\n${formattedDescription || ''}\n`.replace(
    /\s+$/,
    '\n'
  )

  return trailers !== undefined && trailers.length > 0
    ? mergeTrailers(repository, message, trailers)
    : message
}
