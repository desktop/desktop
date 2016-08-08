import tokenStore from './token-store'
import UsersStore from './users-store'
import { requestToken, askUserToAuth } from './auth'
import User from '../models/user'
import Database from './database'
import RepositoriesStore from './repositories-store'
import Repository, { IRepository } from '../models/repository'
import { register, broadcastUpdate as broadcastUpdate_ } from './communication'
import { IURLAction, IAddRepositoriesAction, IUpdateGitHubRepositoryAction } from '../lib/dispatcher'
import { getDotComAPIEndpoint } from '../lib/api'

const Octokat = require('octokat')

const usersStore = new UsersStore(localStorage, tokenStore)
usersStore.loadFromStore()

const database = new Database('Database')
const repositoriesStore = new RepositoriesStore(database)

const broadcastUpdate = () => broadcastUpdate_(usersStore, repositoriesStore)

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

register('add-repositories', async ({ repositories }: IAddRepositoriesAction) => {
  const inflatedRepositories = repositories.map(r => Repository.fromJSON(r as IRepository))
  const addedRepos: Repository[] = []
  for (const repo of inflatedRepositories) {
    const addedRepo = await repositoriesStore.addRepository(repo)
    addedRepos.push(addedRepo)
  }

  broadcastUpdate()
  return addedRepos
})

register('get-repositories', () => {
  return repositoriesStore.getRepositories()
})

register('url-action', async ({ action }: IURLAction) => {
  if (action.name === 'oauth') {
    try {
      const token = await requestToken(action.args.code)
      const octo = new Octokat({ token })
      const user = await octo.user.fetch()
      usersStore.addUser(new User(user.login, getDotComAPIEndpoint(), token, user.email, user.avatarUrl))
    } catch (e) {
      console.error(`Error adding user: ${e}`)
    }
    broadcastUpdate()
  }
})

register('request-oauth', () => {
  askUserToAuth(getDotComAPIEndpoint())
  return Promise.resolve()
})

register('update-github-repository', async ({ repository }: IUpdateGitHubRepositoryAction) => {
  const inflatedRepository = Repository.fromJSON(repository as IRepository)
  await repositoriesStore.updateGitHubRepository(inflatedRepository)
  broadcastUpdate()
})
