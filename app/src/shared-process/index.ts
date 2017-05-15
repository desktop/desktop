import * as TokenStore from '../shared-process/token-store'
import { AccountsStore } from './accounts-store'
import { Account } from '../models/account'
import { Database } from './database'
import { RepositoriesStore } from './repositories-store'
import { Repository, IRepository } from '../models/repository'
import { register, broadcastUpdate as broadcastUpdate_ } from './communication'
import {
  IAddRepositoriesAction,
  IUpdateGitHubRepositoryAction,
  IRemoveRepositoriesAction,
  IAddAccountAction,
  IRemoveAccountAction,
  IUpdateRepositoryMissingAction,
  IUpdateRepositoryPathAction,
} from '../lib/dispatcher'
import { API } from '../lib/api'
import { reportError } from '../ui/lib/exception-reporting'

import { logError } from '../lib/logging/renderer'

process.on('uncaughtException', (error: Error) => {

  logError('Uncaught exception on shared process', error)

  reportError(error)
})

const accountsStore = new AccountsStore(localStorage, TokenStore)
const database = new Database('Database')
const repositoriesStore = new RepositoriesStore(database)

const broadcastUpdate = () => broadcastUpdate_(accountsStore, repositoriesStore)

updateAccounts()

async function updateAccounts() {
  await accountsStore.map(async (account: Account) => {
    const api = new API(account)
    const newAccount = await api.fetchAccount()
    const emails = await api.fetchEmails()
    return new Account(account.login, account.endpoint, account.token, emails, newAccount.avatar_url, newAccount.id, newAccount.name)
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

register('get-accounts', () => accountsStore.getAll())

register('add-account', async ({ account }: IAddAccountAction) => {
  await accountsStore.addAccount(Account.fromJSON(account))
  await updateAccounts()
})

register('remove-account', async ({ account }: IRemoveAccountAction) => {
  await accountsStore.removeAccount(Account.fromJSON(account))
  broadcastUpdate()
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

register('update-repository-missing', async ({ repository, missing }: IUpdateRepositoryMissingAction) => {
  const inflatedRepository = Repository.fromJSON(repository)
  const updatedRepository = await repositoriesStore.updateRepositoryMissing(inflatedRepository, missing)

  broadcastUpdate()

  return updatedRepository
})

register('update-repository-path', async ({ repository, path }: IUpdateRepositoryPathAction) => {
  const inflatedRepository = Repository.fromJSON(repository)
  const updatedRepository = await repositoriesStore.updateRepositoryPath(inflatedRepository, path)
  const newUpdatedRepository = await repositoriesStore.updateRepositoryMissing(updatedRepository, false)

  broadcastUpdate()

  return newUpdatedRepository
})
