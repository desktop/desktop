import { AccountsStore } from './accounts-store'
import { Account, accountEquals } from '../../models/account'
import { API } from '../api'
import { AliveSession, AliveEvent, Subscription } from '@github/alive-client'
import { Emitter } from 'event-kit'
import { enableHighSignalNotifications } from '../feature-flag'

/** Checks whether or not an account is included in a list of accounts. */
function accountIncluded(account: Account, accounts: ReadonlyArray<Account>) {
  return accounts.find(a => accountEquals(a, account))
}

export interface IDesktopChecksFailedAliveEvent {
  readonly type: 'pr-checks-failed'
  readonly timestamp: number
  readonly owner: string
  readonly repo: string
  readonly pull_request_number: number
  readonly check_suite_id: number
  readonly commit_sha: string
}

/** Represents an Alive event relevant to Desktop. */
export type DesktopAliveEvent = IDesktopChecksFailedAliveEvent
interface IAliveSubscription {
  readonly account: Account
  readonly subscription: Subscription<AliveStore>
}

interface IAliveEndpointSession {
  readonly session: AliveSession<AliveStore>
  readonly webSocketUrl: string
}

/**
 * This class manages the subscriptions to Alive channels as the user signs in
 * and out of their GH or GHE accounts.
 */
export class AliveStore {
  private readonly ALIVE_EVENT_RECEIVED_EVENT = 'alive-event-received'

  private readonly sessionPerEndpoint: Map<
    string,
    IAliveEndpointSession
  > = new Map()
  private readonly emitter = new Emitter()
  private subscriptions: Array<IAliveSubscription> = []
  private enabled: boolean = false

  public constructor(private readonly accountsStore: AccountsStore) {
    this.accountsStore.onDidUpdate(this.subscribeToAccounts)
  }

  /**
   * Enable or disable Alive subscriptions.
   *
   * When enabled, it will immediately try to subscribe to the Alive channel for
   * all accounts currently signed in.
   *
   * When disabled, it will immediately unsubscribe from all Alive channels.
   */
  public setEnabled(enabled: boolean) {
    if (this.enabled === enabled) {
      return
    }

    this.enabled = enabled

    if (enabled) {
      this.subscribeToAllAccounts()
    } else {
      this.unsubscribeFromAllAccounts()
    }
  }

  /** Listen to Alive events received. */
  public onAliveEventReceived(callback: (event: DesktopAliveEvent) => void) {
    this.emitter.on(this.ALIVE_EVENT_RECEIVED_EVENT, callback)
  }

  private async subscribeToAllAccounts() {
    const accounts = await this.accountsStore.getAll()
    this.subscribeToAccounts(accounts)
  }

  private unsubscribeFromAllAccounts() {
    const subscribedAccounts = this.subscriptions.map(s => s.account)
    for (const account of subscribedAccounts) {
      this.unsubscribeFromAccount(account)
    }
  }

  private subscribeToAccounts = (accounts: ReadonlyArray<Account>) => {
    if (!this.enabled || !enableHighSignalNotifications()) {
      return
    }

    const subscribedAccounts = this.subscriptions.map(s => s.account)

    // Clear subscriptions for accounts that are no longer in the list
    for (const account of subscribedAccounts) {
      if (!accountIncluded(account, accounts)) {
        this.unsubscribeFromAccount(account)
      }
    }

    // Subscribe to new accounts
    for (const account of accounts) {
      if (!accountIncluded(account, subscribedAccounts)) {
        this.subscribeToAccount(account)
      }
    }
  }

  private sessionForAccount(
    account: Account
  ): IAliveEndpointSession | undefined {
    return this.sessionPerEndpoint.get(account.endpoint)
  }

  private async createSessionForAccount(
    account: Account
  ): Promise<IAliveEndpointSession | null> {
    const session = this.sessionForAccount(account)
    if (session !== undefined) {
      return session
    }

    const api = API.fromAccount(account)
    const webSocketUrl = await api.getAliveWebSocketURL()

    if (webSocketUrl === null) {
      return null
    }

    const aliveSession = new AliveSession(
      webSocketUrl,
      api.getAliveWebSocketURL,
      false,
      this.notify
    )

    const newSession = {
      session: aliveSession,
      webSocketUrl,
    }

    this.sessionPerEndpoint.set(account.endpoint, newSession)

    return newSession
  }

  private unsubscribeFromAccount(account: Account) {
    const endpointSession = this.sessionForAccount(account)
    if (endpointSession === undefined) {
      return
    }

    const subscription = this.subscriptions.find(s =>
      accountEquals(s.account, account)
    )
    if (subscription === undefined) {
      return
    }

    endpointSession.session.unsubscribe([subscription.subscription])
    this.subscriptions = this.subscriptions.filter(
      s => !accountEquals(s.account, account)
    )

    this.sessionPerEndpoint.delete(account.endpoint)

    endpointSession.session.offline()

    console.log('Unubscribed from Alive channel!')
  }

  private subscribeToAccount = async (account: Account) => {
    const endpointSession = await this.createSessionForAccount(account)
    const api = API.fromAccount(account)
    const channelInfo = await api.getAliveDesktopChannel()

    if (endpointSession === null || channelInfo === null) {
      return
    }

    const subscription = {
      subscriber: this,
      topic: {
        name: channelInfo.channel_name,
        signed: channelInfo.signed_channel,
        offset: '',
      },
    }

    endpointSession.session.subscribe([subscription])

    this.subscriptions.push({
      account,
      subscription,
    })

    console.log('Subscribed to Alive channel!')
  }

  private notify = (subscribers: Iterable<AliveStore>, event: AliveEvent) => {
    console.log('Alive event received:', event)

    if (event.type !== 'message') {
      return
    }

    const data = (event.data as any) as DesktopAliveEvent
    if (data.type === 'pr-checks-failed') {
      this.emitter.emit(this.ALIVE_EVENT_RECEIVED_EVENT, data)
    }
  }
}
