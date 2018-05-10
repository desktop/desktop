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
} from '../../../src/database'

const testDb = getTestGHDatabase()

describe('Repository Commands', () => {
  beforeEach(async () => {
    const collection = testDb().getCollection(Collections.Repository)
    await collection.clear()
    await testDb().save()
  })

  describe('addRepository', () => {
    it('works', async () => {
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
    it('performs no-op if given repo does not exist', async () => {
      const dummyKey: RepositoryKey = {
        name: 'no-name',
        path: 'no-path',
      }

      await RepositoryCommands.addGHRepository(
        dummyKey,
        createGHRepository(),
        testDb()
      )

      const repos = await testDb()
        .getCollection(Collections.Repository)
        .find()

      expect(repos.length).to.equal(0)
    })

    it('performs no-op if given a repo that already has an associated GHRepository', async () => {
      // create new repo
      const testPath = 'path'
      const key: RepositoryKey = {
        name: testPath,
        path: testPath,
      }

      await RepositoryCommands.addRepository(testPath, testDb())

      // get repo to add a ghRepository to it
      const repo = await testDb()
        .getCollection(Collections.Repository)
        .findOne({ name: key.name, path: key.path })

      expect(repo!.ghRepository).to.be.undefined

      const repoWithGHRepository: IRepository & LokiObj = {
        ...repo!,
        ghRepository: {
          ...createGHRepository(),
          name: 'original',
        },
      }

      // update the document
      await testDb()
        .getCollection(Collections.Repository)
        .update(repoWithGHRepository)
      await testDb().save()

      // try to add another ghRepository to the same document
      await RepositoryCommands.addGHRepository(
        key,
        createGHRepository(),
        testDb()
      )

      // get the new repo
      const updatedRepo = await testDb()
        .getCollection(Collections.Repository)
        .findOne({ name: key.name, path: key.path })

      expect(updatedRepo!.ghRepository).to.not.be.undefined
      expect(updatedRepo!.ghRepository!.name).to.equal('original')
    })

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

function createGHRepository() {
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
