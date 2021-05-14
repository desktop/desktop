import _ from 'lodash'
import { IAuthor } from '../models/author'
import { Commit } from '../models/commit'
import { GitAuthor } from '../models/git-author'

export function getUniqueCoauthorsAsAuthors(
  commits: ReadonlyArray<Commit>
): ReadonlyArray<IAuthor> {
  const allCommitsCoAuthors: GitAuthor[] = _.flatten(
    commits.map(c => c.coAuthors)
  )

  const uniqueCoAuthors = _.uniqBy(allCommitsCoAuthors, a => a.email && a.name)

  return uniqueCoAuthors.map(ca => {
    return { name: ca.name, email: ca.email, username: null }
  })
}
