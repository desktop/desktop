/** Connect to the authenticated repository protocol; reconnects never replay work. */
export function connect(token, onEvent = () => {}) {
  const pending = new Map()
  const connectionWaiters = new Set()
  let socket
  let nextId = 0
  let generation = 0
  let ready
  let rejectAttempt
  let retryTimer
  let retryDelay = 500
  let stopped = false
  let terminal = false
  let established = false
  let canCancel = false
  let authenticated = false

  function changed() {
    onEvent({
      event: 'requests_changed',
      count: pending.size,
      cancellable:
        canCancel && [...pending.values()].some(item => !item.cancelling),
    })
  }
  function allocateId() {
    if (nextId >= Number.MAX_SAFE_INTEGER) throw new Error('Reopen the session')
    return ++nextId
  }
  function finish(id, error, result) {
    const item = pending.get(id)
    if (!item) return
    pending.delete(id)
    clearTimeout(item.timer)
    item.signal?.removeEventListener('abort', item.abort)
    if (error) item.reject(error)
    else item.resolve(result)
    item.finished()
    changed()
  }
  function cancel(id) {
    const item = pending.get(id)
    if (
      !item ||
      item.cancelling ||
      !canCancel ||
      socket?.readyState !== WebSocket.OPEN
    )
      return
    item.cancelling = true
    try {
      socket.send(
        JSON.stringify({ id: allocateId(), method: 'cancel', request_id: id })
      )
    } catch (error) {
      finish(id, error)
      socket.close()
    }
    changed()
  }
  function open() {
    clearTimeout(retryTimer)
    if (rejectAttempt) {
      const error = new Error('Bridge disconnected; connection replaced')
      error.code = 'disconnected'
      rejectAttempt(error)
    }
    const epoch = ++generation
    if (socket) socket.close()
    authenticated = false
    const current = new WebSocket(`ws://${location.host}/ws`)
    socket = current
    let resolveReady
    let rejectReady
    ready = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    rejectAttempt = rejectReady
    // Retry handshakes can fail when no caller is awaiting ready.
    ready.catch(() => {})
    const timer = setTimeout(() => current.close(), 7000)
    current.onerror = () => {}
    current.onopen = () => {
      if (epoch === generation) current.send(JSON.stringify({ token }))
    }
    current.onmessage = event => {
      if (epoch !== generation) return
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        current.close(1002, 'Invalid bridge message')
        return
      }
      if (message.ready) {
        clearTimeout(timer)
        canCancel = message.capabilities?.cancel === true
        retryDelay = 500
        authenticated = true
        resolveReady()
        for (const waiter of connectionWaiters) waiter.resolve()
        connectionWaiters.clear()
        const reconnected = established
        established = true
        onEvent({ event: 'connected', reconnected })
        changed()
        return
      }
      if (message.event) {
        onEvent(message)
        return
      }
      const error = message.error ? new Error(message.error) : undefined
      if (error) {
        error.code = message.error_code
        if (error.code === 'cancelled') error.name = 'AbortError'
      }
      finish(message.id, error, message.result)
    }
    current.onclose = event => {
      clearTimeout(timer)
      if (epoch !== generation) return
      canCancel = false
      authenticated = false
      terminal = event?.code === 1008
      const error = new Error(
        terminal
          ? 'Session expired; open the new session URL printed by desktop-rs serve.'
          : 'Bridge disconnected; work may have completed. Reconnect and inspect state before retrying.'
      )
      error.code = terminal ? 'session_expired' : 'disconnected'
      rejectReady(error)
      if (terminal || stopped) {
        for (const waiter of connectionWaiters) waiter.reject(error)
        connectionWaiters.clear()
      }
      for (const id of [...pending.keys()]) finish(id, error)
      onEvent({ event: 'disconnected', terminal, closed: stopped })
      if (!stopped && !terminal) {
        retryTimer = setTimeout(() => {
          onEvent({ event: 'reconnecting' })
          open()
        }, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 10000)
      }
    }
    return ready
  }
  open()
  return {
    get ready() {
      return ready
    },
    whenConnected() {
      if (stopped || terminal)
        return Promise.reject(new Error('Open a new session URL'))
      if (authenticated) return Promise.resolve()
      return new Promise((resolve, reject) =>
        connectionWaiters.add({ resolve, reject })
      )
    },
    async request(method, parameters = {}, { signal } = {}) {
      function aborted() {
        const error = new Error('Operation cancelled before it started')
        error.name = 'AbortError'
        return error
      }
      if (signal?.aborted) throw aborted()
      await ready
      if (signal?.aborted) throw aborted()
      if (stopped || !authenticated || socket.readyState !== WebSocket.OPEN) {
        const error = new Error('Bridge disconnected')
        error.code = 'disconnected'
        throw error
      }
      if (pending.size >= 32) throw new Error('Too many pending requests')
      const id = allocateId()
      return new Promise((resolve, reject) => {
        let finished
        const done = new Promise(resolve => {
          finished = resolve
        })
        const abort = () => cancel(id)
        const timer = setTimeout(() => {
          cancel(id)
          finish(
            id,
            new Error(
              'Request timed out; inspect state before retrying a mutation'
            )
          )
        }, 125000)
        pending.set(id, {
          resolve,
          reject,
          timer,
          signal,
          abort,
          done,
          finished,
          cancelling: false,
        })
        signal?.addEventListener('abort', abort, { once: true })
        try {
          const message = JSON.stringify({ ...parameters, id, method })
          if (new TextEncoder().encode(message).byteLength > 65536)
            throw new Error(
              'Request exceeds the 64 KiB WebSocket limit; shorten the input or use the CLI'
            )
          socket.send(message)
        } catch (error) {
          finish(id, error)
        }
        changed()
      })
    },
    async cancelPending() {
      const selected = [...pending.entries()]
      for (const [id] of selected) cancel(id)
      await Promise.all(selected.map(([, item]) => item.done))
      return selected.length
    },
    reconnect() {
      if (stopped || terminal)
        return Promise.reject(new Error('Open a new session URL'))
      if (socket?.readyState === WebSocket.OPEN) return ready
      return open()
    },
    close() {
      stopped = true
      clearTimeout(retryTimer)
      socket.close()
    },
  }
}
