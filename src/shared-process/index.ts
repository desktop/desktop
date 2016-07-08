import tokenStore from './token-store'
import UsersStore from './users-store'
import {requestToken, askUserToAuth} from './auth'
import User from '../models/user'
import {isOAuthAction} from '../lib/parse-url'
import Database from './database'
import RepositoriesStore from './repositories-store'
import Repository, {IRepository} from '../models/repository'
import {register, broadcastUpdate as broadcastUpdate_} from './communication'
import {URLAction, AddRepositoriesAction, RefreshRepositoryAction} from '../actions'
import API, {getDotComAPIEndpoint, getUserForEndpoint} from '../lib/api'

const Octokat = require('octokat')

const usersStore = new UsersStore(localStorage, tokenStore)
usersStore.loadFromStore()

const database = new Database('Database')
const repositoriesStore = new RepositoriesStore(database)

const broadcastUpdate = () => broadcastUpdate_(usersStore, repositoriesStore)

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
    const addedRepo = await repositoriesStore.addRepository(repo)
    updateGitHubRepository(addedRepo)
  }

  broadcastUpdate()
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
    broadcastUpdate()
  }
})

register('request-oauth', () => {
  askUserToAuth(getDotComAPIEndpoint())
  return Promise.resolve()
})

register('refresh-repository', ({repository}: RefreshRepositoryAction) => {
  const inflatedRepository = Repository.fromJSON(repository as IRepository)
  return updateGitHubRepository(inflatedRepository)
})

async function updateGitHubRepository(repository: Repository): Promise<void> {
  const gitHubRepo = repository.getGitHubRepository()
  if (!gitHubRepo) { return Promise.resolve() }

  const users = usersStore.getUsers()
  const user = getUserForEndpoint(users, gitHubRepo.getEndpoint())
  if (!user) { return Promise.resolve() }
  
  const api = new API(user)
  const repo = await api.fetchRepository(gitHubRepo.getOwner().getLogin(), gitHubRepo.getName())
  try {
    await repositoriesStore.updateGitHubRepository(repository.getID(), repo)
  } catch (e) {
    console.error(e)
  }

  broadcastUpdate()
}
