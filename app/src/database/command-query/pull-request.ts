import { getGHDb, RepositoryKey, Collections, toPullRequestModel } from '..'
import { IPullRequestAPIResult } from '../../lib/api'
import { IPullRequestStatus } from '../../lib/databases'
import { forceUnwrap } from '../../lib/fatal-error'

const ghDb = getGHDb()

async function updatePullRequests(
  key: RepositoryKey,
  apiResults: ReadonlyArray<IPullRequestAPIResult>
): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, d => {
    const ghRepo = d.ghRepository
    return {
      ...d,
      ghRepository: {
        ...ghRepo,
        pullRequests: apiResults.map(toPullRequestModel),
      },
    }
  })
}

async function updatePullRequestStatuses(
  key: RepositoryKey,
  prStatusList: Array<IPullRequestStatus>
): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  const repo = collection.findOne({ name: key.name, path: key.path })

  if (repo === null) {
    return log.error(
      `Repository with key ${key.name}+${key.path} cannot be found`
    )
  }

  const ghRepo = forceUnwrap(
    'Cannot update pull request on unpublished repository',
    repo.ghRepository
  )
  const updated = {
    ...repo,
    ghRepository: {
      ...ghRepo,
      prStatusList,
    },
  }

  collection.update(updated)
  ghDb().save()
}

export const Command = {
  updatePullRequests,
  updatePullRequestStatuses,
}

export const Query = {}
