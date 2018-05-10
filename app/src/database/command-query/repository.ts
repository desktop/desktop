import * as Path from 'path'

import {
  Collections,
  IRepository,
  toGHRepositoryModel,
  toRepositoryModel,
  IGHRepository,
  getGHDatabase,
  RepositoryKey,
  GHDatabase,
} from '..'
import { fatalError } from '../../lib/fatal-error'
import { IRepositoryAPIResult } from '../../lib/api'

const ghDb = getGHDatabase()

async function addParentGHRepository(
  repository: IRepository,
  endpoint: string,
  head: IRepositoryAPIResult,
  base: IRepositoryAPIResult,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
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

  await ghDatabase.save()
}

async function addGHRepository(
  key: RepositoryKey,
  ghRepository: IGHRepository,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  const document = collection.findOne({
    name: key.name,
    path: key.path,
  })

  if (document === null) {
    return log.error(
      `Repository with key ${key.name}+${key.path} cannot be found`
    )
  }

  if (document.ghRepository != null) {
    return log.info(
      `Repository with key ${key.name}+${
        key.path
      } already has an associated GHRepository`
    )
  }

  const updated: IRepository & LokiObj = {
    ...document,
    ghRepository,
  }

  await collection.update(updated)
  await ghDatabase.save()
}

async function getAll(
  ghDatabase: GHDatabase = ghDb()
): Promise<ReadonlyArray<IRepository>> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  const repos = await collection.find().map(r => toRepositoryModel(r))

  return repos
}

async function addRepository(
  path: string,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
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

  await ghDatabase.save()
}

async function updateMissingStatus(
  key: RepositoryKey,
  isMissing: boolean,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, r => ({
    ...r,
    isMissing: isMissing,
  }))

  await ghDatabase.save()
}

async function updatePath(
  key: RepositoryKey,
  path: string,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, r => ({
    ...r,
    path,
    isMissing: false,
  }))

  await ghDatabase.save()
}

async function updateGHRepository(
  key: RepositoryKey,
  ghRepository: IGHRepository,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, r => ({
    ...r,
    ghRepository,
  }))

  ghDatabase.save()
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
