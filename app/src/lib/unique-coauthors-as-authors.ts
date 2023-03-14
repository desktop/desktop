import _ from 'lodash'
import { KnownAuthor } from '../models/author'
import { Commit } from '../models/commit'
import { GitAuthor } from '../models/git-author'

export function getUniqueCoauthorsAsAuthors(
  commits: ReadonlyArray<Commit>
): ReadonlyArray<KnownAuthor> {
  const allCommitsCoAuthors: GitAuthor[] = _.flatten(
    commits.map(c => c.coAuthors)
  )

  const uniqueCoAuthors = _.uniqWith(
    allCommitsCoAuthors,
    (a, b) => a.email === b.email && a.name === b.name
  )

  return uniqueCoAuthors.map(ca => {
    return { kind: 'known', name: ca.name, email: ca.email, username: null }
  })
}
