import * as TokenStore from '../shared-process/token-store'
import { UsersStore } from './users-store'
import { User } from '../models/user'
import { Database } from './database'
import { RepositoriesStore } from './repositories-store'
import { Repository, IRepository } from '../models/repository'
import { register, broadcastUpdate as broadcastUpdate_ } from './communication'
import {
  IAddRepositoriesAction,
  IUpdateGitHubRepositoryAction,
  IRemoveRepositoriesAction,
  IAddUserAction,
} from '../lib/dispatcher'
import { API } from '../lib/api'
import { reportError } from '../lib/exception-reporting'
import { getVersion } from '../ui/lib/app-proxy'

import { getLogger } from '../lib/logging/renderer'

process.on('uncaughtException', (error: Error) => {

  getLogger().error('Uncaught exception on shared process', error)

  reportError(error, getVersion())
})

const usersStore = new UsersStore(localStorage, TokenStore)
usersStore.loadFromStore()

const database = new Database('Database')
const repositoriesStore = new RepositoriesStore(database)

const broadcastUpdate = () => broadcastUpdate_(usersStore, repositoriesStore)

updateUsers()

async function updateUsers() {
  await usersStore.map(async (user: User) => {
    const api = new API(user)
    const updatedUser = await api.fetchUser()
    const emails = await api.fetchEmails()
    const justTheEmails = emails.map(e => e.email)
    if (updatedUser) {
    return new User(updatedUser.login, user.endpoint, user.token, justTheEmails, updatedUser.avatar_url, updatedUser.id, updatedUser.name)
    } else {
      return new User(user.login, user.endpoint, user.token, justTheEmails, user.avatarURL, user.id, user.name)
    }
  })
  broadcastUpdate()
}

register('console.log', ({ args }: {args: any[]}) => {
  console.log(args[0], ...args.slice(1))
  return Promise.resolve()
})

register('console.error', ({ args }: {args: any[]}) => {
  console.error(args[0], ...args.slice(1))
  return Promise.resolve()
})

register('ping', () => {
  return Promise.resolve('pong')
})

register('get-users', () => {
  return Promise.resolve(usersStore.getUsers())
})

register('add-user', async ({ user }: IAddUserAction) => {
  usersStore.addUser(User.fromJSON(user))
  await updateUsers()
  return Promise.resolve()
})

register('remove-user', async ({ user }: IAddUserAction) => {
  usersStore.removeUser(User.fromJSON(user))
  broadcastUpdate()
  return Promise.resolve()
})

register('add-repositories', async ({ paths }: IAddRepositoriesAction) => {
  const addedRepos: Repository[] = []
  for (const path of paths) {
    const addedRepo = await repositoriesStore.addRepository(path)
    addedRepos.push(addedRepo)
  }

  broadcastUpdate()
  return addedRepos
})

register('remove-repositories', async ({ repositoryIDs }: IRemoveRepositoriesAction) => {
  const removedRepoIDs: number[] = []
  for (const repoID of repositoryIDs) {
    await repositoriesStore.removeRepository(repoID)
    removedRepoIDs.push(repoID)
  }

  broadcastUpdate()
  return removedRepoIDs
})

register('get-repositories', () => {
  return repositoriesStore.getRepositories()
})

register('update-github-repository', async ({ repository }: IUpdateGitHubRepositoryAction) => {
  const inflatedRepository = Repository.fromJSON(repository as IRepository)
  const updatedRepository = await repositoriesStore.updateGitHubRepository(inflatedRepository)

  broadcastUpdate()

  return updatedRepository
})
