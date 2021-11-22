/* eslint-disable */
import MultiMap from '@github/multimap'

export type Subscription<T> = {
  subscriber: T
  topic: Topic
}

export class SubscriptionSet<T> {
  private subscriptions = new MultiMap<string, T>()
  private signatures = new Map<string, Topic>()

  add(...subscriptions: Array<Subscription<T>>): Topic[] {
    const added = []
    for (const { subscriber, topic } of subscriptions) {
      if (!this.subscriptions.has(topic.name)) {
        added.push(topic)
        this.signatures.set(topic.name, topic)
      }
      this.subscriptions.set(topic.name, subscriber)
    }
    return added
  }

  delete(...subscriptions: Array<Subscription<T>>): Topic[] {
    const removed = []
    for (const { subscriber, topic } of subscriptions) {
      const deleted = this.subscriptions.delete(topic.name, subscriber)
      if (deleted && !this.subscriptions.has(topic.name)) {
        removed.push(topic)
        this.signatures.delete(topic.name)
      }
    }
    return removed
  }

  drain(...subscribers: T[]): Topic[] {
    const removed = []
    for (const subscriber of subscribers) {
      for (const name of this.subscriptions.drain(subscriber)) {
        const topic = this.signatures.get(name)!
        this.signatures.delete(name)
        removed.push(topic)
      }
    }
    return removed
  }

  topics(): Iterable<Topic> {
    return this.signatures.values()
  }

  topic(name: string): Topic | null {
    return this.signatures.get(name) || null
  }

  subscribers(topic: string): Iterable<T> {
    return this.subscriptions.get(topic).values()
  }
}

export class Topic {
  public name: string
  public signed: string
  public offset: string

  // eslint-disable-next-line
  static parse(data: string): Topic | null {
    const [content, signature] = data.split('--')
    if (!content || !signature) return null

    const sub = JSON.parse(atob(content))
    if (!sub.c || !sub.t) return null

    return new Topic(sub.c, data)
  }

  // eslint-disable-next-line
  constructor(name: string, signed: string) {
    this.name = name
    this.signed = signed
    this.offset = ''
  }
}
