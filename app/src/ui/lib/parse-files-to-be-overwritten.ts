import { GitError } from '../../lib/git'
import { GitError as DugiteError } from 'dugite'

export function parseFilesToBeOverwritten(error: GitError) {
  const dugiteError = error.result.gitError
  const files = new Array<string>()

  if (
    dugiteError !== DugiteError.LocalChangesOverwritten &&
    dugiteError !== DugiteError.MergeWithLocalChanges &&
    dugiteError !== DugiteError.RebaseWithLocalChanges
  ) {
    return files
  }

  const { stderr } = error.result
  const lines = stderr.split('\n')

  const start = lines.findIndex(
    l =>
      l.startsWith('error:') &&
      l.includes('files would be overwritten') &&
      l.endsWith(':')
  )

  for (let i = start; i < lines.length && lines[i].startsWith('\t'); i++) {
    files.push(lines[i].trimLeft())
  }

  return files
}
