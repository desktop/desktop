/* eslint-disable */
export const IDLE_METADATA_KEY = '_i'
export type Metadata = Record<string, unknown> & { [IDLE_METADATA_KEY]?: 0 | 1 }

export interface MetadataUpdate<T> {
  subscriber: T
  channelName: string
  metadata: Metadata[]
}

interface LocalizationOptions<T> {
  subscriber: T
  markAllAsLocal: boolean
}

function markMetadataAsLocal(metadata: Metadata): Metadata {
  return {
    ...metadata,
    isLocal: true,
  }
}

class PresenceMetadataForChannel<T> {
  private subscriberMetadata = new Map<T, Metadata[]>()

  public setMetadata(subscriber: T, value: Metadata[]) {
    this.subscriberMetadata.set(subscriber, value)
  }

  public removeSubscribers(subscribers: T[]) {
    let found = false

    for (const subscriber of subscribers) {
      found = this.subscriberMetadata.delete(subscriber) || found
    }

    return found
  }

  // Get all the metadata for this channel, combining metadata arrays from all subscribers
  public getMetadata(localizationOptions?: LocalizationOptions<T>) {
    if (!localizationOptions) {
      // No need to add `isLocal`. We can just flatten the metadata arrays from the subscribers
      const allMetadata: Metadata[] = []
      let idle: boolean | undefined

      for (const subscriberMetadata of this.subscriberMetadata.values()) {
        for (const metadata of subscriberMetadata) {
          if (IDLE_METADATA_KEY in metadata) {
            // Since each subscriber can have an idle record, we want to dedupe them into a single idle record
            // This saves a lot of space in the presence payload if a user has many tabs or elements subscribed to the same channel
            const subscriberIsIdle = Boolean(metadata[IDLE_METADATA_KEY])
            idle =
              idle === undefined ? subscriberIsIdle : subscriberIsIdle && idle
          } else {
            allMetadata.push(metadata)
          }
        }
      }

      if (idle !== undefined) {
        allMetadata.push({ [IDLE_METADATA_KEY]: idle ? 1 : 0 })
      }

      return allMetadata
    }

    // Localization requested.  Add `isLocal` to the appropriate metadata items
    // We do not need to de-dupe idle records because this data is not going over the wire
    const metadata = []
    const { subscriber, markAllAsLocal } = localizationOptions

    for (const [fromSubscriber, subscriberMetadata] of this
      .subscriberMetadata) {
      const shouldLocalizeMetadata =
        markAllAsLocal || fromSubscriber === subscriber
      const metadataToAdd = shouldLocalizeMetadata
        ? subscriberMetadata.map(markMetadataAsLocal)
        : subscriberMetadata
      metadata.push(...metadataToAdd)
    }

    return metadata
  }

  hasSubscribers() {
    return this.subscriberMetadata.size > 0
  }
}

export class PresenceMetadataSet<T> {
  private metadataByChannel = new Map<string, PresenceMetadataForChannel<T>>()

  public setMetadata({ subscriber, channelName, metadata }: MetadataUpdate<T>) {
    let channelMetadata = this.metadataByChannel.get(channelName)

    if (!channelMetadata) {
      channelMetadata = new PresenceMetadataForChannel()
      this.metadataByChannel.set(channelName, channelMetadata)
    }

    channelMetadata.setMetadata(subscriber, metadata)
  }

  public removeSubscribers(subscribers: T[]) {
    const channelsWithSubscribers = new Set<string>()

    for (const [channelName, channelMetadata] of this.metadataByChannel) {
      const channelHadSubscriber = channelMetadata.removeSubscribers(
        subscribers
      )

      if (channelHadSubscriber) {
        channelsWithSubscribers.add(channelName)
      }

      // Clean up the channel if it has no subscribers
      if (!channelMetadata.hasSubscribers()) {
        this.metadataByChannel.delete(channelName)
      }
    }

    return channelsWithSubscribers
  }

  getChannelMetadata(
    channelName: string,
    localizationOptions?: LocalizationOptions<T>
  ) {
    const channelMetadata = this.metadataByChannel.get(channelName)
    return channelMetadata?.getMetadata(localizationOptions) || []
  }
}
