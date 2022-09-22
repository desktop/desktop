import { Commit } from '../../models/commit'

export function getSquashedCommitDescription(
  commits: ReadonlyArray<Commit>,
  squashOnto: Commit
): string {
  const commitMessages = commits.map(
    c => `${c.summary.trim()}\n\n${c.bodyNoCoAuthors.trim()}`
  )

  const descriptions = [
    squashOnto.bodyNoCoAuthors.trim(),
    ...commitMessages,
  ].filter(d => d.trim() !== '')

  return descriptions.join('\n\n')
}
