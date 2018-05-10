import * as Path from 'path'

import {
  Collections,
  IRepository,
  toGHRepositoryModel,
  toRepositoryModel,
  IGHRepository,
  getGHDb,
  RepositoryKey,
} from '...'
import { fatalError } from '../../lib/fatal-error'
import { IRepositoryAPIResult } from '../../lib/api'

const ghDb = getGHDb()

async function addParentGHRepository(
  repository: IRepository,
  endpoint: string,
  head: IRepositoryAPIResult,
  base: IRepositoryAPIResult
): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  const document = collection.findOne({
    name: repository.name,
    path: repository.path,
  })

  if (document === null) {
    return log.error('Repository not found')
  }

  if (document.ghRepository == null) {
    return fatalError("Cannot add base repo when gh repo doesn't exist")
  }

  await collection.findAndUpdate(
    {
      name: repository.name,
      path: repository.path,
    },
    r => ({
      kind: 'repository',
      ...r,
      ghRepository: {
        ...toGHRepositoryModel(head, endpoint),
        parent: toGHRepositoryModel(base, endpoint),
      },
    })
  )

  await ghDb().save()
}

async function addGHRepository(
  repository: IRepository,
  endpoint: string,
  apiResult: IRepositoryAPIResult
): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  const document = collection.findOne({
    name: repository.name,
    path: repository.path,
  })

  if (document === null) {
    return log.error(
      `Repository with key ${repository.name}+${
        repository.path
      } cannot be found`
    )
  }

  if (document.ghRepository !== null) {
    return log.info(
      `Repository with key ${repository.name}+${
        repository.path
      } already has an associated GHRepository`
    )
  }

  const updated: IRepository & LokiObj = {
    ...document,
    ghRepository: toGHRepositoryModel(apiResult, endpoint),
  }

  await collection.update(updated)
  await ghDb().save()
}

async function getAll(): Promise<ReadonlyArray<IRepository>> {
  const collection = ghDb().getCollection(Collections.Repository)
  const repos = await collection.find().map(r => toRepositoryModel(r))

  return repos
}

async function addRepository(path: string): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  const repo = collection.findOne({ path })

  if (repo !== null) {
    return
  }

  const newRepo = await collection.insertOne({
    kind: 'repository',
    name: Path.basename(path),
    isMissing: false,
    path,
  })

  if (newRepo === undefined) {
    return log.error('Unable to add repository')
  }

  await ghDb().save()
}

async function updateMissingStatus(
  key: RepositoryKey,
  isMissing: boolean
): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, r => ({
    ...r,
    isMissing: isMissing,
  }))

  await ghDb().save()
}

async function updatePath(key: RepositoryKey, path: string): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, r => ({
    ...r,
    path,
    isMissing: false,
  }))

  await ghDb().save()
}

async function updateGHRepository(
  key: RepositoryKey,
  ghRepository: IGHRepository
): Promise<void> {
  const collection = ghDb().getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, r => ({
    ...r,
    ghRepository,
  }))

  ghDb().save()
}

export const Command = {
  addRepository,
  addGHRepository,
  addParentGHRepository,
  updateMissingStatus,
  updatePath,
  updateGHRepository,
}

export const Query = {
  getAll,
}
