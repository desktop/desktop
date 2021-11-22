/* eslint-disable */
import {
  AlivePresence,
  AlivePresenceData,
  PresenceItem,
  UserPresence,
  getPresenceKey,
  isPresenceChannel,
} from './alive/presence'
import {
  IDLE_METADATA_KEY,
  MetadataUpdate,
  PresenceMetadataSet,
} from './alive/presence-metadata'
import type { Subscription, Topic } from './subscription-set'

import type { Socket } from '@github/stable-socket'
import { StableSocket } from '@github/stable-socket'
import { SubscriptionSet } from './subscription-set'
import { eachSlice } from './iterables'
import { retry } from './eventloop-tasks'

const enum SocketDisconnectReasons {
  Deploy = 'Alive Redeploy', // Alive server is shutting down, likely due to a redeploy
  Reconnect = 'Alive Reconnect', // Routine disconnect to keep the lifespan of WebSockets short (every 25-35 mins).  Server is not deploying.
}

interface AliveMessageData {
  timestamp: number
  wait: number
  gid?: string
}

export type AliveData = AliveMessageData | AlivePresenceData

interface Ack {
  e: 'ack'
  off: string
  health: boolean
}

interface Message {
  e: 'msg'
  ch: string
  off: string
  data: AliveData
}

interface MessageEvent {
  type: 'message'
  data: AliveMessageData
}

interface PresenceEvent {
  type: 'presence'
  data: UserPresence[]
}

export type AliveEvent = { channel: string } & (MessageEvent | PresenceEvent)
export type Notifier<T> = (subscribers: Iterable<T>, event: AliveEvent) => void

function generatePresenceId() {
  // outputs a string like 2118047710_1628653223
  return `${Math.round(Math.random() * (Math.pow(2, 31) - 1))}_${Math.round(
    Date.now() / 1000
  )}`
}

function getUserIdFromSocketUrl(url: string): number {
  const match = url.match(/\/u\/(\d+)\/ws/)
  return match ? +match[1] : 0
}

export default class AliveSession<T> {
  private socket: Socket
  private subscriptions = new SubscriptionSet<T>()
  private notify: Notifier<T>
  private refreshUrl: string
  private shared: boolean
  private state: 'online' | 'offline' = 'online'
  private redeployEarlyReconnectTimeout:
    | ReturnType<typeof setTimeout>
    | undefined
  private retrying: AbortController | null = null
  // presenceId is a random number specific to this AliveSession
  private readonly presenceId: string
  private readonly userId: number
  // presenceId is a combination of the userId and the presenceId.  It can be used to identify presence items from this AliveSession
  private readonly presenceKey: string
  private connectionCount = 0
  private presence = new AlivePresence()
  private presenceMetadata = new PresenceMetadataSet<T>()
  private intentionallyDisconnected = false
  private lastCameOnline = 0

  constructor(
    private url: string,
    refreshUrl: string,
    shared: boolean,
    notify: Notifier<T>
  ) {
    this.userId = getUserIdFromSocketUrl(url)
    this.presenceId = generatePresenceId()
    this.presenceKey = getPresenceKey(this.userId, this.presenceId)
    this.refreshUrl = refreshUrl
    this.notify = notify
    this.shared = shared
    this.socket = this.connect()
  }

  subscribe(subscriptions: Array<Subscription<T>>) {
    const added = this.subscriptions.add(...subscriptions)
    this.sendSubscribe(added)

    // Send locally cached presence items to presence channels.
    // This is necessary because we only receive a full presence state when we initially subscribe to a presence channel.
    // If a second subscription is addded to the same presence channel, it will never receive another full state from Alive.
    for (const subscription of subscriptions) {
      const channel = subscription.topic.name
      if (!isPresenceChannel(channel)) {
        continue
      }

      this.notifyCachedPresence(subscription.subscriber, channel)
    }
  }

  unsubscribe(subscriptions: Array<Subscription<T>>) {
    const removed = this.subscriptions.delete(...subscriptions)
    this.sendUnsubscribe(removed)
  }

  unsubscribeAll(...subscribers: T[]) {
    const removed = this.subscriptions.drain(...subscribers)
    this.sendUnsubscribe(removed)

    // Remove metadata for these subscribers and send metadata updates
    const updatedPresenceChannels = this.presenceMetadata.removeSubscribers(
      subscribers
    )
    this.sendPresenceMetadataUpdate(updatedPresenceChannels)
  }

  requestPresence(subscriber: T, channels: string[]) {
    // This is used for SharedWorker to send presence items on new subscriptions.
    // This will only be called when the tab already has a subscription to the presence channel and receives another (redundant) subscription
    for (const channel of channels) {
      this.notifyCachedPresence(subscriber, channel)
    }
  }

  private notifyCachedPresence(subscriber: T, channel: string) {
    const presenceItems = this.presence.getChannelItems(channel)
    if (presenceItems.length === 0) {
      return
    }

    // Presence items exist for this channel, send them to the subscriber immediately.
    this.notifyPresenceChannel(channel, presenceItems)
  }

  updatePresenceMetadata(metadataUpdates: Array<MetadataUpdate<T>>) {
    const updatedChannels = new Set<string>()
    for (const update of metadataUpdates) {
      this.presenceMetadata.setMetadata(update)
      updatedChannels.add(update.channelName)
    }

    this.sendPresenceMetadataUpdate(updatedChannels)
  }

  private sendPresenceMetadataUpdate(channelNames: Set<string>) {
    if (!channelNames.size) {
      return
    }

    const topics: Topic[] = []
    for (const channelName of channelNames) {
      // Get the topic associated with the channel
      // If there is no topic, the channel has been fully unsubscribed so we don't need to send an update
      const topic = this.subscriptions.topic(channelName)
      if (topic) {
        topics.push(topic)
      }
    }

    // Send a new subscribe for all associated topics
    // This subscribe will automatically include the new metadata values
    this.sendSubscribe(topics)
  }

  online() {
    this.lastCameOnline = Date.now()
    this.state = 'online'
    this.retrying?.abort()
    this.socket.open()
  }

  offline() {
    this.state = 'offline'
    this.retrying?.abort()
    this.socket.close()
  }

  shutdown() {
    if (this.shared) {
      self.close()
    }
  }

  get reconnectWindow() {
    const wasRecentlyOffline = Date.now() - this.lastCameOnline < 60 * 1000
    if (
      this.connectionCount === 0 ||
      this.intentionallyDisconnected ||
      wasRecentlyOffline
    ) {
      return 0
    }

    // Possibly disconnected due to a server crashing.  Provide a longer reconnect window so that we spread reconnects out over time to reduce the thundering herd.
    // It's also possible we get here with small network blips that don't trigger "offline" state.
    //   In that case, we want to reconnect immediately, but we can't effectively distinguish between those events and a server crashing.
    return 10 * 1000
  }

  socketDidOpen() {
    this.intentionallyDisconnected = false
    this.connectionCount++
    // force a new url into the socket so that the server can pick up the new presence id
    // TODO: we should add a method to StableSocket to allow url to be updated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.socket as any).url = this.getUrlWithPresenceId()

    // Subscribe again after connection failure.
    this.sendSubscribe(this.subscriptions.topics())
  }

  socketDidClose(socket: Socket, code: number, reason: string) {
    if (this.redeployEarlyReconnectTimeout !== undefined) {
      clearTimeout(this.redeployEarlyReconnectTimeout)
    }

    if (reason === SocketDisconnectReasons.Reconnect) {
      this.intentionallyDisconnected = true
    } else if (reason === SocketDisconnectReasons.Deploy) {
      this.intentionallyDisconnected = true

      // When Alive re-deploys, it will drain the existing connections over a 3 minute period.
      // Alive also forces clients clients to reconnect every 25-35 minutes by disconnecting from the server side.
      // After a deploy, this ~30 minute reconnect will cause big ripples in the number of connections.
      // To avoid those ripples, the client should manually reconnect after 3-25 minutes after a deploy.
      const reconnectDelayMinutes = 3 + Math.random() * 22 // 3-25 minutes
      const reconnectDelay = reconnectDelayMinutes * 60 * 1000

      this.redeployEarlyReconnectTimeout = setTimeout(() => {
        this.intentionallyDisconnected = true

        // Send the same code back to the server so that it knows this is a reconnect due to a deploy.
        // The Alive will keep gathering messages for the currently subscribed channels, so that we can do a catchup after reconnect.
        // eslint-disable-next-line i18n-text/no-en
        this.socket.close(1000, 'Alive Redeploy Early Client Reconnect')
      }, reconnectDelay)
    }
  }

  socketDidFinish() {
    if (this.state === 'offline') return
    this.reconnect()
  }

  socketDidReceiveMessage(_: Socket, message: string) {
    const payload = JSON.parse(message)
    console.log('Received Alive message:', payload)
    switch (payload.e) {
      case 'ack': {
        this.handleAck(payload)
        break
      }
      case 'msg': {
        this.handleMessage(payload)
        break
      }
    }
  }

  private handleAck(ack: Ack) {
    for (const topic of this.subscriptions.topics()) {
      topic.offset = ack.off
    }
  }

  private handleMessage(msg: Message) {
    const channel = msg.ch
    const topic = this.subscriptions.topic(channel)
    if (!topic) return
    topic.offset = msg.off

    if ('e' in msg.data) {
      // Process the message to update the presence items
      const presenceItems = this.presence.handleMessage(channel, msg.data)

      // Notify all subscribers with the new presence items
      this.notifyPresenceChannel(channel, presenceItems)
      return
    }

    if (!msg.data.wait) msg.data.wait = 0
    this.notify(this.subscriptions.subscribers(channel), {
      channel,
      type: 'message',
      data: msg.data,
    })
  }

  notifyPresenceChannel(channel: string, presenceItems: PresenceItem[]) {
    // Build UserPresence objects from the PresenceItems
    const userPresenceById = new Map<number, UserPresence>()
    for (const presenceItem of presenceItems) {
      const { userId, metadata, presenceKey } = presenceItem
      const userPresence = userPresenceById.get(userId) || {
        userId,
        isOwnUser: userId === this.userId,
        metadata: [],
      }

      if (presenceKey === this.presenceKey) {
        // Local metadata will be included in the notify loop below
        continue
      }

      for (const data of metadata) {
        // extract idle state if presence
        if (IDLE_METADATA_KEY in data) {
          if (userPresence.isIdle !== false) {
            userPresence.isIdle = Boolean(data[IDLE_METADATA_KEY])
          }
          // We assume that idle metadata is sent in it's own object, so don't add this to the metadata array.
          continue
        }

        // otherwise pass along metadata as-is
        userPresence.metadata.push(data)
      }

      userPresenceById.set(userId, userPresence)
    }

    // Notify each subscriber.  This needs to be done individually so that we can localize the metadata for the current user.
    for (const subscriber of this.subscriptions.subscribers(channel)) {
      const userId = this.userId
      const otherUsers = Array.from(userPresenceById.values()).filter(
        user => user.userId !== userId
      )

      const ownUserRemoteMetadata =
        userPresenceById.get(this.userId)?.metadata ?? []
      // Use local metadata for this presence connection to avoid any round trip lag
      // Pass the specific subscriber receiving this data so that the isLocal flag can be set properly
      const ownUserLocalMetadata = this.presenceMetadata.getChannelMetadata(
        channel,
        {
          subscriber,
          // For a single tab, we want everything to be considered "local"
          // In the SharedWorker, we only want to mark items from the specific subscriber as "local"
          markAllAsLocal: !this.shared,
        }
      )

      this.notify([subscriber], {
        channel,
        type: 'presence',
        data: [
          {
            userId,
            isOwnUser: true,
            metadata: [...ownUserRemoteMetadata, ...ownUserLocalMetadata],
            // Note that we do not include isIdle on own user.  It's assumed you never want to see yourself as idle.
          },
          ...otherUsers,
        ],
      })
    }
  }

  private async reconnect() {
    if (this.retrying) return
    try {
      this.retrying = new AbortController()
      const fn = () => fetchRefreshUrl(this.refreshUrl)
      const url = await retry(fn, Infinity, 60000, this.retrying.signal)
      if (url) {
        this.url = url
        this.socket = this.connect()
      } else {
        this.shutdown()
      }
    } catch (e) {
      if (e.name !== 'AbortError') throw e
    } finally {
      this.retrying = null
    }
  }

  private getUrlWithPresenceId() {
    const liveUrl = new URL(this.url, self.location.origin)
    liveUrl.searchParams.set('shared', this.shared.toString())
    liveUrl.searchParams.set('p', `${this.presenceId}.${this.connectionCount}`)
    return liveUrl.toString()
  }

  private connect(): Socket {
    const socket = new StableSocket(this.getUrlWithPresenceId(), this, {
      timeout: 4000,
      attempts: 7,
    })
    socket.open()
    return socket
  }

  private sendSubscribe(topics: Iterable<Topic>) {
    const entries = Array.from(topics)
    for (const slice of eachSlice(entries, 25)) {
      const subscribe: { [signed: string]: string } = {}

      for (const topic of slice) {
        if (isPresenceChannel(topic.name)) {
          // presence channels send metadata as the value
          subscribe[topic.signed] = JSON.stringify(
            this.presenceMetadata.getChannelMetadata(topic.name)
          )
        } else {
          // other channels send the current offset as the value
          subscribe[topic.signed] = topic.offset
        }
      }

      this.socket.send(JSON.stringify({ subscribe }))
    }
  }

  private sendUnsubscribe(topics: Iterable<Topic>) {
    const signed = Array.from(topics, t => t.signed)
    for (const slice of eachSlice(signed, 25)) {
      this.socket.send(JSON.stringify({ unsubscribe: slice }))
    }

    // Clear cached presence items for unsubscribed channels
    for (const topic of topics) {
      if (isPresenceChannel(topic.name)) {
        this.presence.clearChannel(topic.name)
      }
    }
  }
}

type PostUrl = { url?: string; token?: string }
async function fetchRefreshUrl(url: string): Promise<string | null> {
  const data = await fetchJSON<PostUrl>(url)
  return data && data.url && data.token ? post(data.url, data.token) : null
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (response.ok) {
    return response.json()
  } else if (response.status === 404) {
    return null
  } else {
    throw new Error('fetch error')
  }
}

async function post(url: string, csrf: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    mode: 'same-origin',
    headers: {
      'Scoped-CSRF-Token': csrf,
    },
  })
  if (response.ok) {
    return response.text()
  } else {
    throw new Error('fetch error')
  }
}
