import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  AssistantMessageEvent,
  MessageOptions,
  SessionEventPayload,
} from '@github/copilot-sdk'
import {
  awaitCancellableCopilotOperation,
  ICopilotMessageSession,
  ICopilotPlanningSession,
  CopilotResponseEvent,
  sendCopilotMessageRequest,
  sendCopilotPlanningRequest,
} from '../../src/lib/copilot-operation'
import { CopilotError } from '../../src/lib/copilot-error'
import { assistantMessage, deferred } from '../helpers/copilot-assisted-commit'

const cancellationError = () => new Error('Synthetic cancellation')

describe('awaitCancellableCopilotOperation', () => {
  it('does not start an already-cancelled operation', async t => {
    const controller = new AbortController()
    controller.abort()
    const operation = t.mock.fn(async () => 'value')
    await assert.rejects(
      awaitCancellableCopilotOperation(operation, {
        signal: controller.signal,
        cancellationError,
      }),
      /Synthetic cancellation/
    )
    assert.equal(operation.mock.callCount(), 0)
  })

  for (const withSignal of [false, true]) {
    it(`returns success without disposing caller-owned results (signal=${withSignal})`, async t => {
      const controller = new AbortController()
      const disposeLateValue = t.mock.fn(async () => {})
      const remove = t.mock.method(controller.signal, 'removeEventListener')
      const value = {}
      assert.equal(
        await awaitCancellableCopilotOperation(async () => value, {
          signal: withSignal ? controller.signal : undefined,
          cancellationError,
          disposeLateValue,
        }),
        value
      )
      controller.abort()
      assert.equal(disposeLateValue.mock.callCount(), 0)
      assert.equal(remove.mock.callCount(), withSignal ? 1 : 0)
    })
  }

  for (const synchronous of [false, true]) {
    it(`preserves setup failure and removes the abort listener (sync=${synchronous})`, async t => {
      const controller = new AbortController()
      const remove = t.mock.method(controller.signal, 'removeEventListener')
      const failure = new Error('Synthetic setup failure')
      await assert.rejects(
        awaitCancellableCopilotOperation(
          () => {
            if (synchronous) {
              throw failure
            }
            return Promise.reject(failure)
          },
          { signal: controller.signal, cancellationError }
        ),
        error => error === failure
      )
      assert.equal(remove.mock.callCount(), 1)
    })
  }

  for (const synchronous of [false, true]) {
    it(`disposes a late result once, including abort during setup (sync=${synchronous})`, async t => {
      const controller = new AbortController()
      const pending = deferred<object>()
      const disposeLateValue = t.mock.fn((_value: object) => {})
      const remove = t.mock.method(controller.signal, 'removeEventListener')
      const value = {}
      const operation = awaitCancellableCopilotOperation(
        () => {
          if (synchronous) {
            controller.abort()
          }
          return pending.promise
        },
        { signal: controller.signal, cancellationError, disposeLateValue }
      )
      controller.abort()
      await assert.rejects(operation, /Synthetic cancellation/)
      assert.equal(disposeLateValue.mock.callCount(), 0)
      pending.resolve(value)
      await new Promise(resolve => setImmediate(resolve))
      controller.abort()
      assert.equal(disposeLateValue.mock.callCount(), 1)
      assert.equal(disposeLateValue.mock.calls[0].arguments[0], value)
      assert.equal(remove.mock.callCount(), 1)
    })
  }

  for (const synchronous of [false, true]) {
    it(`reports late cleanup failures without replacing cancellation (sync=${synchronous})`, async t => {
      const controller = new AbortController()
      const pending = deferred<object>()
      const failure = new Error('Synthetic cleanup failure')
      const logged = t.mock.method(log, 'error', () => {})
      const operation = awaitCancellableCopilotOperation(
        () => pending.promise,
        {
          signal: controller.signal,
          cancellationError,
          disposeLateValue: () => {
            if (synchronous) {
              throw failure
            }
            return Promise.reject(failure)
          },
        }
      )
      controller.abort()
      await assert.rejects(operation, /Synthetic cancellation/)
      pending.resolve({})
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(logged.mock.callCount(), 1)
      assert.equal(logged.mock.calls[0].arguments[1], failure)
    })
  }

  it('observes late setup rejection and preserves the caller cancellation error', async t => {
    const controller = new AbortController()
    const pending = deferred<never>()
    const failure = new Error('Synthetic late setup failure')
    const onLateError = t.mock.fn()
    const cancelled = new Error('Caller cancellation')
    const operation = awaitCancellableCopilotOperation(() => pending.promise, {
      signal: controller.signal,
      cancellationError: () => cancelled,
      onLateError,
    })
    controller.abort()
    await assert.rejects(operation, error => error === cancelled)
    pending.reject(failure)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(onLateError.mock.callCount(), 1)
    assert.equal(onLateError.mock.calls[0].arguments[0], failure)
  })

  it('cancels one waiter without cancelling shared metadata or another waiter', async () => {
    const controller = new AbortController()
    const shared = deferred<object>()
    const first = awaitCancellableCopilotOperation(() => shared.promise, {
      signal: controller.signal,
      cancellationError,
    })
    const second = awaitCancellableCopilotOperation(() => shared.promise, {
      cancellationError,
    })
    controller.abort()
    await assert.rejects(first, /Synthetic cancellation/)
    const value = {}
    shared.resolve(value)
    assert.equal(await second, value)
  })
})

function createMessageSession(
  send: (
    options: MessageOptions,
    timeoutMs: number
  ) => Promise<AssistantMessageEvent | undefined>
) {
  const errors = new Set<
    (data: SessionEventPayload<'session.error'>['data']) => void
  >()
  const session: ICopilotMessageSession = {
    onSessionError: handler => {
      errors.add(handler)
      return () => errors.delete(handler)
    },
    sendAndWait: send,
    disconnect: async () => {
      throw new Error('Response waiter must not disconnect the session')
    },
  }
  return {
    session,
    emitError: (data: SessionEventPayload<'session.error'>['data']) =>
      errors.forEach(handler => handler(data)),
    listenerCount: () => errors.size,
  }
}

describe('sendCopilotMessageRequest', () => {
  for (const response of [undefined, assistantMessage('Synthetic response')]) {
    it(`preserves SDK response ${response?.data.content} and request timeout`, async t => {
      const send = t.mock.fn(async () => response)
      const fake = createMessageSession(send)
      const options = { prompt: 'Synthetic prompt' }
      assert.equal(
        await sendCopilotMessageRequest(fake.session, options, 123, {
          cancellationError,
        }),
        response
      )
      assert.deepEqual(send.mock.calls[0].arguments, [options, 123])
      assert.equal(fake.listenerCount(), 0)
    })
  }

  for (const statusCode of [401, 402]) {
    for (const succeeds of [false, true]) {
      it(`preserves commit-message error policy (status=${statusCode}, success=${succeeds})`, async t => {
        const logged = t.mock.method(log, 'error', () => {})
        const failure = new Error('Synthetic SDK rejection')
        const response = assistantMessage('Synthetic response')
        const fake = createMessageSession(async () => {
          fake.emitError({
            errorType: 'synthetic',
            statusCode,
            errorCode: 'quota_exceeded',
            message: `${statusCode} Synthetic session error`,
          })
          if (!succeeds) {
            throw failure
          }
          return response
        })
        const operation = sendCopilotMessageRequest(
          fake.session,
          { prompt: 'Synthetic prompt' },
          123,
          { cancellationError }
        )
        if (succeeds) {
          assert.equal(await operation, response)
        } else {
          await assert.rejects(operation, error => {
            if (statusCode !== 402) {
              return error === failure
            }
            assert.ok(error instanceof CopilotError)
            assert.equal(error.code, 'quota_exceeded')
            assert.equal(error.message, 'Synthetic session error')
            return true
          })
        }
        assert.equal(logged.mock.callCount(), statusCode === 402 ? 0 : 1)
        assert.equal(fake.listenerCount(), 0)
      })
    }
  }

  for (const alreadyAborted of [false, true]) {
    it(`releases listeners on cancellation and observes late SDK rejection (pre-abort=${alreadyAborted})`, async t => {
      const controller = new AbortController()
      const remove = t.mock.method(controller.signal, 'removeEventListener')
      const pending = deferred<never>()
      const send = t.mock.fn(() => pending.promise)
      const fake = createMessageSession(send)
      if (alreadyAborted) {
        controller.abort()
      }
      const operation = sendCopilotMessageRequest(
        fake.session,
        { prompt: 'Synthetic prompt' },
        123,
        { signal: controller.signal, cancellationError }
      )
      controller.abort()
      await assert.rejects(operation, /Synthetic cancellation/)
      assert.equal(fake.listenerCount(), 0)
      assert.equal(send.mock.callCount(), alreadyAborted ? 0 : 1)
      assert.equal(remove.mock.callCount(), alreadyAborted ? 0 : 1)
      if (!alreadyAborted) {
        pending.reject(new Error('Synthetic late SDK rejection'))
      }
    })
  }
})

function createPlanningSession(send: () => Promise<string>) {
  const handlers = new Set<(event: CopilotResponseEvent) => void>()
  const fake = createMessageSession(async () => {
    throw new Error('Event-driven requests must not use SDK sendAndWait')
  })
  const session: ICopilotPlanningSession = {
    ...fake.session,
    send,
    onResponseEvent: handler => {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
  return {
    session,
    emit: (event: CopilotResponseEvent) =>
      handlers.forEach(handler => handler(event)),
    listenerCount: () => handlers.size + fake.listenerCount(),
  }
}

function idleEvent(
  data: SessionEventPayload<'session.idle'>['data'] = {}
): SessionEventPayload<'session.idle'> {
  return {
    ...assistantMessage(''),
    type: 'session.idle',
    ephemeral: true,
    data,
  }
}

describe('sendCopilotPlanningRequest correlated completion', () => {
  for (const ackFirst of [false, true]) {
    it(`returns the final corrected root response after ACK and completion (ACK first=${ackFirst})`, async t => {
      const ack = deferred<string>()
      const fake = createPlanningSession(() => ack.promise)
      const controller = new AbortController()
      const remove = t.mock.method(controller.signal, 'removeEventListener')
      let completed = false
      const operation = sendCopilotPlanningRequest(
        fake.session,
        { prompt: 'Synthetic prompt' },
        controller.signal,
        cancellationError
      ).then(response => {
        completed = true
        return response
      })
      fake.emit(idleEvent())
      if (ackFirst) {
        ack.resolve('synthetic-request')
      }
      fake.emit(assistantMessage('Intermediate response'))
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(completed, false)
      const primary = assistantMessage('Corrected response')
      fake.emit(primary)
      fake.emit({ ...assistantMessage('Subagent response'), agentId: 'child' })
      fake.emit({
        ...assistantMessage('Unrelated root response'),
        data: {
          ...primary.data,
          content: 'Unrelated root response',
          originatingMessageId: 'other-request',
        },
      })
      fake.emit({
        ...assistantMessage(''),
        type: 'session.error',
        data: {
          originatingMessageId: 'other-request',
          errorType: 'query',
          message: 'Unrelated request failure',
        },
      })
      fake.emit({ ...idleEvent(), agentId: 'child' })
      fake.emit(idleEvent({ mode: 'autopilot' }))
      fake.emit(idleEvent())
      if (!ackFirst) {
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(completed, false)
        ack.resolve('synthetic-request')
      }
      assert.equal(await operation, primary)
      assert.equal(fake.listenerCount(), 0)
      assert.equal(remove.mock.callCount(), 1)
    })
  }

  for (const terminal of [
    'abort',
    'error',
    'autopilot-abort',
    'autopilot-error',
  ] as const) {
    it(`rejects ${terminal} after success-shaped content, including events before ACK`, async () => {
      const ack = deferred<string>()
      const fake = createPlanningSession(() => ack.promise)
      const operation = sendCopilotPlanningRequest(
        fake.session,
        { prompt: 'Synthetic' },
        new AbortController().signal,
        cancellationError
      )
      fake.emit(assistantMessage('Not a completed result'))
      if (terminal === 'abort') {
        fake.emit(idleEvent({ aborted: true }))
      } else if (terminal === 'error') {
        fake.emit({
          ...assistantMessage(''),
          type: 'session.error',
          data: {
            originatingMessageId: 'synthetic-request',
            errorType: 'query',
            message: 'Structured output failed',
          },
        })
      } else {
        fake.emit({
          ...idleEvent(),
          type: 'session.autopilot_stopped',
          data: {
            requestId: 'synthetic-request',
            reason: terminal === 'autopilot-abort' ? 'aborted' : 'error',
          },
        })
      }
      ack.resolve('synthetic-request')
      await assert.rejects(operation, /aborted|failed|error/)
      assert.equal(fake.listenerCount(), 0)
    })
  }

  it('does not reuse earlier content after a final tool-request message', async () => {
    const fake = createPlanningSession(async () => 'synthetic-request')
    const operation = sendCopilotPlanningRequest(
      fake.session,
      { prompt: 'Synthetic' },
      new AbortController().signal,
      cancellationError
    )
    fake.emit(assistantMessage('Earlier content'))
    fake.emit({
      ...assistantMessage('Tool response'),
      data: {
        ...assistantMessage('').data,
        toolRequests: [{ toolCallId: 'tool', name: 'forbidden' }],
      },
    })
    fake.emit(idleEvent())
    assert.equal(await operation, undefined)
    assert.equal(fake.listenerCount(), 0)
  })

  it('requires a matching origin, not merely a root message', async () => {
    const fake = createPlanningSession(async () => 'synthetic-request')
    const operation = sendCopilotPlanningRequest(
      fake.session,
      { prompt: 'Synthetic' },
      new AbortController().signal,
      cancellationError
    )
    fake.emit({
      ...assistantMessage(''),
      type: 'user.message',
      data: { messageId: 'synthetic-request', content: 'Synthetic' },
    })
    fake.emit({
      ...assistantMessage('Legacy uncorrelated response'),
      data: { messageId: 'legacy', content: 'Not owned' },
    })
    fake.emit(idleEvent())
    assert.equal(await operation, undefined)
  })

  it('uses only matching root Autopilot completion, not unrelated or child terminals', async () => {
    const fake = createPlanningSession(async () => 'synthetic-request')
    let completed = false
    const operation = sendCopilotPlanningRequest(
      fake.session,
      { prompt: 'Synthetic' },
      new AbortController().signal,
      cancellationError
    ).then(response => {
      completed = true
      return response
    })
    const response = assistantMessage('Final response')
    fake.emit(response)
    fake.emit({
      ...idleEvent(),
      type: 'session.autopilot_stopped',
      data: { requestId: 'other-request', reason: 'aborted' },
    })
    fake.emit({
      ...idleEvent(),
      agentId: 'child',
      type: 'session.autopilot_stopped',
      data: { requestId: 'synthetic-request', reason: 'task_complete' },
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(completed, false)
    fake.emit({
      ...idleEvent(),
      type: 'session.autopilot_stopped',
      data: { requestId: 'synthetic-request', reason: 'task_complete' },
    })
    assert.equal(await operation, response)
    assert.equal(fake.listenerCount(), 0)
  })

  it('cancels while admission is pending, releases listeners, and ignores late events/rejection', async () => {
    const ack = deferred<string>()
    const fake = createPlanningSession(() => ack.promise)
    const controller = new AbortController()
    const operation = sendCopilotPlanningRequest(
      fake.session,
      { prompt: 'Synthetic' },
      controller.signal,
      cancellationError
    )
    fake.emit(assistantMessage('Partial'))
    controller.abort()
    await assert.rejects(operation, /Synthetic cancellation/)
    assert.equal(fake.listenerCount(), 0)
    fake.emit(idleEvent())
    ack.reject(new Error('Late admission failure'))
  })

  it('rejects admission failure even after matching response and idle arrived', async () => {
    const failure = new Error('Admission failed')
    const ack = deferred<string>()
    const fake = createPlanningSession(() => ack.promise)
    const operation = sendCopilotPlanningRequest(
      fake.session,
      { prompt: 'Synthetic' },
      new AbortController().signal,
      cancellationError
    )
    fake.emit(assistantMessage('Not admitted'))
    fake.emit(idleEvent())
    ack.reject(failure)
    await assert.rejects(operation, error => error === failure)
    assert.equal(fake.listenerCount(), 0)
  })
})
