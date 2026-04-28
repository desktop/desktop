import {
  RequestChannels,
  RequestResponseChannels,
} from '../../src/lib/ipc-shared'

interface IPCSendCall {
  readonly channel: string
  readonly args: ReadonlyArray<unknown>
}

interface IPCInvokeCall {
  readonly channel: string
  readonly args: ReadonlyArray<unknown>
}

type InvokeHandler<T extends keyof RequestResponseChannels> = (
  ...args: Parameters<RequestResponseChannels[T]>
) => ReturnType<RequestResponseChannels[T]>

/**
 * A mock IPC implementation that records all send/invoke calls and allows
 * setting up canned responses for invoke (request-response) channels.
 *
 * Usage:
 * ```ts
 * const ipc = new MockIPC()
 * ipc.onInvoke('get-path', async (pathType) => '/mock/path')
 *
 * // In test: verify calls were made
 * assert.equal(ipc.sends.length, 1)
 * assert.equal(ipc.sends[0].channel, 'log')
 * ```
 */
export class MockIPC {
  /** All recorded send() calls (one-way messages) */
  public readonly sends: IPCSendCall[] = []

  /** All recorded invoke() calls (request-response) */
  public readonly invokes: IPCInvokeCall[] = []

  /** Registered listeners by channel */
  private readonly listeners = new Map<
    string,
    Array<(...args: any[]) => void>
  >()

  /** Registered invoke handlers */
  private readonly invokeHandlers = new Map<
    keyof RequestResponseChannels,
    unknown
  >()

  /**
   * Mock implementation of ipcRenderer.send — records the call.
   */
  public send<T extends keyof RequestChannels>(
    channel: T,
    ...args: Parameters<RequestChannels[T]>
  ): void {
    this.sends.push({ channel, args })
  }

  /**
   * Mock implementation of ipcRenderer.invoke — records the call
   * and returns the canned response if a handler is registered.
   */
  public invoke<T extends keyof RequestResponseChannels>(
    channel: T,
    ...args: Parameters<RequestResponseChannels[T]>
  ): ReturnType<RequestResponseChannels[T]> {
    this.invokes.push({ channel, args })
    const handler = this.invokeHandlers.get(channel) as
      | InvokeHandler<T>
      | undefined

    if (handler === undefined) {
      return Promise.reject(
        new Error(`No invoke handler registered for '${channel}'`)
      ) as ReturnType<RequestResponseChannels[T]>
    }

    return handler(...args)
  }

  /**
   * Mock implementation of ipcRenderer.on — registers a listener.
   */
  public on(channel: string, listener: (...args: any[]) => void): void {
    const existing = this.listeners.get(channel) ?? []
    existing.push(listener)
    this.listeners.set(channel, existing)
  }

  /**
   * Mock implementation of ipcRenderer.once — registers a one-time listener.
   */
  public once(channel: string, listener: (...args: any[]) => void): void {
    const wrapper = (...args: any[]) => {
      this.removeListener(channel, wrapper)
      listener(...args)
    }
    this.on(channel, wrapper)
  }

  /**
   * Mock implementation of ipcRenderer.removeListener.
   */
  public removeListener(
    channel: string,
    listener: (...args: any[]) => void
  ): void {
    const existing = this.listeners.get(channel) ?? []
    this.listeners.set(
      channel,
      existing.filter(l => l !== listener)
    )
  }

  /**
   * Register a handler for an invoke (request-response) channel.
   * The handler will be called when invoke() is called with this channel.
   */
  public onInvoke<T extends keyof RequestResponseChannels>(
    channel: T,
    handler: InvokeHandler<T>
  ): void {
    this.invokeHandlers.set(channel, handler)
  }

  /**
   * Simulate the main process sending a message to the renderer on a channel.
   * This triggers all registered listeners for that channel.
   */
  public emit(channel: string, ...args: any[]): void {
    const listeners = this.listeners.get(channel) ?? []
    for (const listener of [...listeners]) {
      listener({}, ...args)
    }
  }

  /**
   * Returns all sends for a specific channel.
   */
  public getSends<T extends keyof RequestChannels>(
    channel: T
  ): ReadonlyArray<IPCSendCall> {
    return this.sends.filter(s => s.channel === channel)
  }

  /**
   * Returns all invokes for a specific channel.
   */
  public getInvokes<T extends keyof RequestResponseChannels>(
    channel: T
  ): ReadonlyArray<IPCInvokeCall> {
    return this.invokes.filter(i => i.channel === channel)
  }

  /**
   * Resets all recorded calls and registered handlers.
   */
  public reset(): void {
    this.sends.length = 0
    this.invokes.length = 0
    this.listeners.clear()
    this.invokeHandlers.clear()
  }
}
