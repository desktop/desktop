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

describe('sendCopilotPlanningRequest ordering remains planner-specific', () => {
  for (const ackFirst of [false, true]) {
    it(`waits for both send ACK and idle (ACK first=${ackFirst})`, async t => {
      const ack = deferred<string>()
      const messages = new Set<(event: AssistantMessageEvent) => void>()
      const idle = new Set<() => void>()
      const fake = createMessageSession(async () => {
        throw new Error('Planner must not use SDK sendAndWait')
      })
      const session: ICopilotPlanningSession = {
        ...fake.session,
        send: () => ack.promise,
        onAssistantMessage: handler => {
          messages.add(handler)
          return () => messages.delete(handler)
        },
        onIdle: handler => {
          idle.add(handler)
          return () => idle.delete(handler)
        },
      }
      const controller = new AbortController()
      const remove = t.mock.method(controller.signal, 'removeEventListener')
      let completed = false
      const operation = sendCopilotPlanningRequest(
        session,
        { prompt: 'Synthetic prompt' },
        controller.signal,
        cancellationError
      ).then(response => {
        completed = true
        return response
      })
      if (ackFirst) {
        ack.resolve('synthetic-id')
      } else {
        idle.forEach(handler => handler())
      }
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(completed, false)
      const primary = assistantMessage('Primary response')
      messages.forEach(handler => handler(primary))
      messages.forEach(handler =>
        handler({ ...assistantMessage('Subagent response'), agentId: 'child' })
      )
      if (ackFirst) {
        idle.forEach(handler => handler())
      } else {
        ack.resolve('synthetic-id')
      }
      assert.equal(await operation, primary)
      assert.equal(messages.size + idle.size + fake.listenerCount(), 0)
      assert.equal(remove.mock.callCount(), 1)
    })
  }
})
