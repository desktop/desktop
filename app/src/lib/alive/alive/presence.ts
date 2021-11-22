/* eslint-disable */
import { Metadata } from './presence-metadata'

// This is the compact data format that Alive sends to the client
export interface PresenceItemCompact {
  u: number // user id
  p: string // presence id with connection count 123:456.1
  m?: Metadata[] // metadata
}

interface FullPresenceData {
  e: 'pf'
  d: PresenceItemCompact[]
}

interface AddPresenceData {
  e: 'pa'
  d: PresenceItemCompact
}

interface RemovePresenceData {
  e: 'pr'
  d: PresenceItemCompact
}

export type AlivePresenceData =
  | FullPresenceData
  | AddPresenceData
  | RemovePresenceData

export interface UserPresence {
  userId: number
  metadata: Metadata[]
  isOwnUser: boolean
  isIdle?: boolean
}

export interface PresenceItem {
  userId: number
  metadata: Metadata[]
  presenceKey: string
  connectionCount: number
}

export function getPresenceKey(userId: number, presenceId: string) {
  return `${userId}:${presenceId}`
}

export function decompressItem(data: PresenceItemCompact): PresenceItem {
  const [presenceId, connectionCount] = data.p.split('.')

  return {
    userId: data.u,
    // presenceId is randomly generated and is not guaranteed to be unique
    // if we combine it with the userId, we have less chances of collisions, and we prevent tampering by other users manually setting their presenceId
    presenceKey: getPresenceKey(data.u, presenceId),
    connectionCount: Number(connectionCount),
    metadata: data.m || [],
  }
}

const presenceChannelPrefix = 'presence-'
export function isPresenceChannel(channelName: string) {
  return channelName.startsWith(presenceChannelPrefix)
}

class PresenceChannel {
  private presenceItems: Map<string, PresenceItem> = new Map()

  private shouldUsePresenceItem(item: PresenceItem) {
    const existingItem = this.presenceItems.get(item.presenceKey)

    // We only want to use presence items that are for the same or higher connection count
    // If we don't already have an item for this presence id, we should use it
    // If we do have an item, and the connection count is equal or higher, we should use it
    // Otherwise, we know the item we just received is actually older, so we should ignore it
    return !existingItem || existingItem.connectionCount <= item.connectionCount
  }

  addPresenceItem(item: PresenceItem) {
    if (!this.shouldUsePresenceItem(item)) {
      return
    }

    this.presenceItems.set(item.presenceKey, item)
  }

  removePresenceItem(item: PresenceItem) {
    if (!this.shouldUsePresenceItem(item)) {
      // We have this item, but the item we received is older, so we should ignore it
      return
    }

    this.presenceItems.delete(item.presenceKey)
  }

  replacePresenceItems(items: PresenceItem[]) {
    this.presenceItems.clear()

    for (const item of items) {
      this.addPresenceItem(item)
    }
  }

  getPresenceItems(): PresenceItem[] {
    return Array.from(this.presenceItems.values())
  }
}

export class AlivePresence {
  private presenceChannels: Map<string, PresenceChannel> = new Map()

  private getPresenceChannel(channelName: string): PresenceChannel {
    const channel =
      this.presenceChannels.get(channelName) || new PresenceChannel()
    this.presenceChannels.set(channelName, channel)
    return channel
  }

  handleMessage(channelName: string, data: AlivePresenceData) {
    const channel = this.getPresenceChannel(channelName)

    switch (data.e) {
      case 'pf':
        channel.replacePresenceItems(data.d.map(decompressItem))
        break
      case 'pa':
        channel.addPresenceItem(decompressItem(data.d))
        break
      case 'pr':
        channel.removePresenceItem(decompressItem(data.d))
        break
    }

    return this.getChannelItems(channelName)
  }

  getChannelItems(channelName: string): PresenceItem[] {
    const channel = this.getPresenceChannel(channelName)
    return channel.getPresenceItems()
  }

  clearChannel(channelName: string) {
    this.presenceChannels.delete(channelName)
  }
}
