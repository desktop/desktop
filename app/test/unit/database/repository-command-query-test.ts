import { expect } from 'chai'
import { getTestGHDatabase } from '../../helpers/test-gh-database'
import {
  RepositoryCommands,
  Collections,
  RepositoryQueries,
  RepositoryKey,
  IGHRepository,
  IUser,
  IRepository,
  keyOf,
} from '../../../src/database'

const testDb = getTestGHDatabase()

describe('Repository Commands', () => {
  beforeEach(async () => {
    const collection = testDb().getCollection(Collections.Repository)
    await collection.clear()
    await testDb().save()
  })

  describe('addRepository', () => {
    it('adds the repository', async () => {
      const testPath = 'test'
      await RepositoryCommands.addRepository(testPath, testDb())

      const addedRepo = testDb()
        .getCollection(Collections.Repository)
        .find()

      expect(addedRepo.length).to.equal(1)
    })

    it('performs no-op when given path that already exists', async () => {
      const testPath = 'test'
      await RepositoryCommands.addRepository(testPath, testDb())
      await RepositoryCommands.addRepository(testPath, testDb())

      const addedRepo = testDb()
        .getCollection(Collections.Repository)
        .find()

      expect(addedRepo.length).to.equal(1)
    })
  })

  describe('addGHRepository', () => {
    it('adds the ghRepository', async () => {
      // create new repo
      const testPath = 'path'
      const key: RepositoryKey = {
        name: testPath,
        path: testPath,
      }

      await RepositoryCommands.addRepository(testPath, testDb())

      // get repo to add a ghRepository to it
      let repo = await testDb()
        .getCollection(Collections.Repository)
        .findOne({ name: key.name, path: key.path })

      expect(repo!.ghRepository).to.be.undefined

      // add ghRepository
      await RepositoryCommands.addGHRepository(
        key,
        createGHRepository(),
        testDb()
      )

      // get the new repo
      repo = await testDb()
        .getCollection(Collections.Repository)
        .findOne({ name: key.name, path: key.path })

      expect(repo!.ghRepository).to.not.be.undefined
    })
  })

  describe('addParentGHRepository', () => {
    it.only('adds gh repository to document', async () => {
      const repoToInsert = {
        ...createRepository(),
        ghRepository: {
          ...createGHRepository(),
        },
      }
      const key = keyOf(repoToInsert)
      await testDb()
        .getCollection(Collections.Repository)
        .insertOne(repoToInsert)

      testDb().save()

      await RepositoryCommands.addParentGHRepository(
        key,
        '',
        createGHRepository(),
        createGHRepository(),
        testDb()
      )

      const updatedRepo = await testDb()
        .getCollection(Collections.Repository)
        .findOne({ name: key.name, path: key.path })

      expect(updatedRepo!.ghRepository).to.not.be.undefined
    })
  })
})

describe('Repository Queries', () => {
  beforeEach(async () => {
    const collection = testDb().getCollection(Collections.Repository)
    await collection.clear()
    await testDb().save()
  })

  describe('getAll', () => {
    it('returns all repositories', async () => {
      await RepositoryCommands.addRepository('test-repo-1', testDb())
      await RepositoryCommands.addRepository('test-repo-2', testDb())
      await RepositoryCommands.addRepository('test-repo-3', testDb())
      await RepositoryCommands.addRepository('test-repo-4', testDb())

      const repos = await RepositoryQueries.getAll(testDb())

      expect(repos.length).to.equal(4)
    })
  })
})

function createRepository(): IRepository {
  return {
    kind: 'repository',
    name: 'name',
    path: 'path',
    isMissing: false,
  }
}

function createGHRepository(): IGHRepository {
  const owner: IUser = {
    name: null,
    login: '',
    email: null,
    endpoint: '',
    avatarUrl: '',
  }
  const ghRepository: IGHRepository = {
    kind: 'gh-repository',
    name: '',
    defaultBranch: '',
    isPrivate: false,
    cloneUrl: '',
    htmlUrl: '',
    issues: [],
    owner: owner,
    parent: null,
    mentionables: [],
    pullRequests: [],
  }
  return ghRepository
}
