import {ipcRenderer} from 'electron'
import tokenStore from './token-store'
import UsersStore from './users-store'
import {requestToken, askUserToAuth, getDotComEndpoint} from './auth'
import User from '../models/user'
import {isOAuthAction} from '../lib/parse-url'
import Database from './database'
import RepositoriesStore from './repositories-store'
import Repository, {IRepository} from '../models/repository'
import {dispatch, register, broadcastUpdate} from './communication'
import GitHubRepositoriesCache from './github-repositories-cache'
import {FindGitHubRepositoryAction, URLAction} from '../actions'
import {updateCaches} from './cache-updating'

const Octokat = require('octokat')

const CacheUpdateInterval = 1000 * 60 * 60

const usersStore = new UsersStore(localStorage, tokenStore)
usersStore.loadFromStore()

const database = new Database('Database')
const repositoriesStore = new RepositoriesStore(database)
const gitHubRepositoriesCache = new GitHubRepositoriesCache(database)

updateCaches(usersStore, gitHubRepositoriesCache)

setInterval(() => updateCaches(usersStore, gitHubRepositoriesCache), CacheUpdateInterval)

register('console.log', ({args}: {args: any[]}) => {
  console.log('', ...args)
  return Promise.resolve()
})

register('console.error', ({args}: {args: any[]}) => {
  console.error('', ...args)
  return Promise.resolve()
})

register('ping', () => {
  return Promise.resolve('pong')
})

register('get-users', () => {
  return Promise.resolve(usersStore.getUsers())
})

register('add-repositories', async ({repositories}: {repositories: IRepository[]}) => {
  const inflatedRepositories = repositories.map(r => Repository.fromJSON(r))
  for (const repo of inflatedRepositories) {
    await repositoriesStore.addRepository(repo)
  }

  broadcastUpdate(usersStore, repositoriesStore)
})

register('get-repositories', () => {
  return repositoriesStore.getRepositories()
})

register('find-github-repository', ({remoteURL}: FindGitHubRepositoryAction) => {
  return gitHubRepositoriesCache.findRepositoryWithRemoteURL(remoteURL)
})

register('url-action', async ({action}: URLAction) => {
  if (isOAuthAction(action)) {
    try {
      const token = await requestToken(action.args.code)
      const octo = new Octokat({token})
      const user = await octo.user.fetch()
      usersStore.addUser(new User(user.login, getDotComEndpoint(), token))
    } catch (e) {
      console.error(`Error adding user: ${e}`)
    }
    broadcastUpdate(usersStore, repositoriesStore)
  }
})

register('request-oauth', () => {
  askUserToAuth(getDotComEndpoint())
  return Promise.resolve()
})

ipcRenderer.on('shared/request', (event, args) => {
  dispatch(args[0])
})
