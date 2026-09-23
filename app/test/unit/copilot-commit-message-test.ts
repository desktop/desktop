import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCopilotCommitMessage } from '../../src/lib/copilot-commit-message'

describe('parseCopilotCommitMessage', () => {
  it('parses object payloads', () => {
    assert.deepEqual(
      parseCopilotCommitMessage(
        '{"title":"Fix token renewal","description":"Preserve credentials"}'
      ),
      { title: 'Fix token renewal', description: 'Preserve credentials' }
    )
  })

  it('rejects arrays, null, and primitives as non-object payloads', () => {
    for (const content of [
      '[]',
      '[{"title":"Not an object"}]',
      'null',
      '"text"',
      '42',
      'true',
    ]) {
      assert.throws(() => parseCopilotCommitMessage(content), {
        message:
          'Copilot returned an invalid commit message payload: expected an object',
      })
    }
  })
})
