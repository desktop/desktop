import * as crypto from 'crypto'
import { GitHubRepository } from '../models/github-repository'

/** Method to create the url for viewing a commit on dotcom */
export function createCommitURL(
  gitHubRepository: GitHubRepository,
  SHA: string,
  filePath?: string
): string | null {
  const baseURL = gitHubRepository.htmlURL

  if (baseURL === null) {
    return null
  }

  if (filePath === undefined) {
    return `${baseURL}/commit/${SHA}`
  }

  const fileHash = crypto.createHash('sha256').update(filePath).digest('hex')
  const fileSuffix = '#diff-' + fileHash

  return `${baseURL}/commit/${SHA}${fileSuffix}`
}
