import uniqWith from 'lodash/uniqWith'
import { KnownAuthor } from '../models/author'
import { Commit } from '../models/commit'

export function getUniqueCoauthorsAsAuthors(
  commits: ReadonlyArray<Commit>
): ReadonlyArray<KnownAuthor> {
  const allCommitsCoAuthors = commits.flatMap(c => c.coAuthors)

  const uniqueCoAuthors = uniqWith(
    allCommitsCoAuthors,
    (a, b) => a.email === b.email && a.name === b.name
  )

  return uniqueCoAuthors.map(ca => {
    return { kind: 'known', name: ca.name, email: ca.email, username: null }
  })
}
