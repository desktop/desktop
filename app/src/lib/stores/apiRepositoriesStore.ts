import { BaseStore } from './base-store'
import { AccountsStore } from './accounts-store'
import { IAPIRepository, API } from '../api'
import { Account } from '../../models/account'
import { merge } from '../merge'

export interface IAccountRepositories {
  readonly repositories: ReadonlyArray<IAPIRepository>
  readonly loading: boolean
}

export class ApiRepositoriesStore extends BaseStore {
  private accountState: ReadonlyMap<Account, IAccountRepositories> = new Map<
    Account,
    IAccountRepositories
  >()

  public constructor(private readonly accountsStore: AccountsStore) {
    super()

    this.accountsStore.onDidUpdate(async () => {
      const accounts = await this.accountsStore.getAll()
      const newState = new Map<Account, IAccountRepositories>()

      for (const account of accounts) {
        for (const [key, value] of this.accountState.entries()) {
          if (
            key.login === account.login &&
            key.endpoint === account.endpoint
          ) {
            newState.set(account, value)
            break
          }
        }
      }

      this.accountState = newState
      this.emitUpdate()
    })
  }

  private updateAccount<T, K extends keyof IAccountRepositories>(
    account: Account,
    repositories: Pick<IAccountRepositories, K>
  ) {
    const newState = new Map<Account, IAccountRepositories>(this.accountState)
    const existingRepositories = newState.get(account)

    newState.set(
      account,
      existingRepositories === undefined
        ? repositories
        : merge(existingRepositories, repositories)
    )

    this.accountState = newState
    this.emitUpdate()
  }

  public async loadRepositories(account: Account) {
    const existingRepositories = this.accountState.get(account)

    if (existingRepositories !== undefined && existingRepositories.loading) {
      return
    }

    this.updateAccount(account, { loading: true })

    const api = API.fromAccount(account)
    const repositories = await api.fetchRepositories()

    if (repositories === null) {
      this.updateAccount(account, { loading: false })
      return
    }

    this.updateAccount(account, { loading: true, repositories })
  }

  public getState(): ReadonlyMap<Account, IAccountRepositories> {
    return this.accountState
  }
}
