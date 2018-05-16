import {
  getGHDatabase,
  RepositoryKey,
  Collections,
  toPullRequestModel,
  GHDatabase,
} from '..'
import { IPullRequestAPIResult } from '../../lib/api'
import { IPullRequestStatus } from '../../lib/databases'
import { forceUnwrap } from '../../lib/fatal-error'

const ghDb = getGHDatabase()

async function updatePullRequests(
  key: RepositoryKey,
  apiResults: ReadonlyArray<IPullRequestAPIResult>,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
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

  ghDatabase.save()
}

async function updatePullRequestStatuses(
  key: RepositoryKey,
  prStatusList: Array<IPullRequestStatus>,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
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
  ghDatabase.save()
}

export const Command = {
  updatePullRequests,
  updatePullRequestStatuses,
}

export const Query = {}
