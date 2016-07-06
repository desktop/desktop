import tokenStore from './token-store'
import UsersStore from './users-store'
import {requestToken, askUserToAuth} from './auth'
import User from '../models/user'
import {isOAuthAction} from '../lib/parse-url'
import Database from './database'
import RepositoriesStore from './repositories-store'
import Repository, {IRepository} from '../models/repository'
import {register, broadcastUpdate} from './communication'
import {URLAction, AddRepositoriesAction} from '../actions'
import API, {getDotComAPIEndpoint, getUserForEndpoint} from '../lib/api'

const Octokat = require('octokat')

const usersStore = new UsersStore(localStorage, tokenStore)
usersStore.loadFromStore()

const database = new Database('Database')
const repositoriesStore = new RepositoriesStore(database)

register('console.log', ({args}: {args: any[]}) => {
  console.log(args[0], ...args.slice(1))
  return Promise.resolve()
})

register('console.error', ({args}: {args: any[]}) => {
  console.error(args[0], ...args.slice(1))
  return Promise.resolve()
})

register('ping', () => {
  return Promise.resolve('pong')
})

register('get-users', () => {
  return Promise.resolve(usersStore.getUsers())
})

register('add-repositories', async ({repositories}: AddRepositoriesAction) => {
  const inflatedRepositories = repositories.map(r => Repository.fromJSON(r as IRepository))
  for (const repo of inflatedRepositories) {
    const id = await repositoriesStore.addRepository(repo)
    updateGitHubRepository(repo, id)
  }

  broadcastUpdate(usersStore, repositoriesStore)
})

register('get-repositories', () => {
  return repositoriesStore.getRepositories()
})

register('url-action', async ({action}: URLAction) => {
  if (isOAuthAction(action)) {
    try {
      const token = await requestToken(action.args.code)
      const octo = new Octokat({token})
      const user = await octo.user.fetch()
      usersStore.addUser(new User(user.login, getDotComAPIEndpoint(), token))
    } catch (e) {
      console.error(`Error adding user: ${e}`)
    }
    broadcastUpdate(usersStore, repositoriesStore)
  }
})

register('request-oauth', () => {
  askUserToAuth(getDotComAPIEndpoint())
  return Promise.resolve()
})

async function updateGitHubRepository(repository: Repository, repoID: number): Promise<void> {
  const gitHubRepo = repository.getGitHubRepository()
  const users = usersStore.getUsers()
  const user = getUserForEndpoint(users, gitHubRepo.getEndpoint())
  const api = new API(user)
  const repo = await api.fetchRepository(gitHubRepo.getOwner().getLogin(), gitHubRepo.getName())
  try {
    await repositoriesStore.updateGitHubRepository(repoID, repo)
  } catch (e) {
    console.error(e)
  }

  console.log('repo:')
  console.log(repo)
}
