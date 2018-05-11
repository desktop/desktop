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
import { IRepositoryAPIResult } from '../../lib/api'

const ghDb = getGHDatabase()

function repositoryNotFound(key: RepositoryKey) {
  return `Repository with key ${key.name}+${key.path} cannot be found`
}

function repositoryAlreadyExists(key: RepositoryKey) {
  return `Repository with key ${key.name}+${key.path} already exists`
}

function noAssociatedGHRepository(key: RepositoryKey) {
  return `Repository with key ${key.name}+${
    key.path
  } has no associated GH Repositroy`
}

function associatedGHRepositry(key: RepositoryKey) {
  return `Repository with key ${key.name}+${
    key.path
  } already has an associated GH Repository`
}

async function addParentGHRepository(
  key: RepositoryKey,
  endpoint: string,
  head: IGHRepository,
  base: IGHRepository,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  const document = collection.findOne({
    name: key.name,
    path: key.path,
  })

  if (document === null) {
    return log.warn(repositoryNotFound(key))
  }

  if (document.ghRepository === undefined) {
    return log.warn(noAssociatedGHRepository(key))
  }

  await collection.findAndUpdate(
    {
      name: key.name,
      path: key.path,
    },
    r => ({
      kind: 'repository',
      ...r,
      ghRepository: {
        ...head,
        parent: {
          ...base,
        },
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
    return log.warn(repositoryNotFound(key))
  }

  if (document.ghRepository != null) {
    return log.warn(associatedGHRepositry(key))
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
  const repos = await collection.find().map(toRepositoryModel)

  return repos
}

async function addRepository(
  path: string,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  const key = { name: Path.basename(path), path }
  const repo = collection.findOne({ name: key.name, path: key.path })

  if (repo !== null) {
    return log.warn(repositoryAlreadyExists(key))
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

async function updateGHRepository<K extends keyof IRepository>(
  key: RepositoryKey,
  ghRepository: Pick<IRepository, K>,
  ghDatabase: GHDatabase = ghDb()
): Promise<void> {
  const collection = ghDatabase.getCollection(Collections.Repository)
  await collection.findAndUpdate({ name: key.name, path: key.path }, r => ({
    ...r,
    ghRepository: {
      ghRepository,
    },
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
