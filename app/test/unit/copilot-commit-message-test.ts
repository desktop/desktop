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

  it('preserves code fences inside JSON descriptions', () => {
    for (const fence of ['```json', '```sh', '```']) {
      const expected = {
        title: 'Document configuration',
        description: `Example:\n${fence}\n{"enabled":true}\n\`\`\``,
      }
      assert.deepEqual(
        parseCopilotCommitMessage(JSON.stringify(expected)),
        expected
      )
    }
  })

  it('rejects Markdown-wrapped responses without extracting their JSON', () => {
    const content = '{"title":"Document configuration","description":""}'
    for (const fence of ['```json', '```']) {
      assert.throws(
        () => parseCopilotCommitMessage(`${fence}\n${content}\n\`\`\``),
        {
          message:
            'Copilot returned invalid JSON for commit message generation',
        }
      )
    }
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
