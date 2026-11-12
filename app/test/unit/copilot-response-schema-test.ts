import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Ajv from 'ajv'
import {
  CopilotAssistedCommitResponseSchema,
  parseCopilotAssistedCommitStructuredResponse,
} from '../../src/lib/copilot-assisted-commit'
import { CopilotCommitMessageResponseSchema } from '../../src/lib/copilot-commit-message'
import {
  CopilotConflictResolutionResponseSchema,
  parseCopilotConflictResolution,
  validateResolutionPaths,
} from '../../src/lib/copilot-conflict-resolution'
import {
  assertPlanningError,
  syntheticAnalysis,
  wholeSelectionResponse,
  splitResponse,
} from '../helpers/copilot-assisted-commit'
import { isRecord } from '../../src/lib/is-record'

const ajv = new Ajv()

describe('Copilot response schemas', () => {
  it('uses the portable strict-provider vocabulary with scalar-typed enums and no root unions', () => {
    const check = (schema: unknown) => {
      assert.ok(isRecord(schema))
      for (const key of Object.keys(schema)) {
        assert.ok(
          [
            'type',
            'properties',
            'required',
            'additionalProperties',
            'items',
            'enum',
            'anyOf',
          ].includes(key),
          `Unsupported schema keyword ${key}`
        )
      }
      if (Array.isArray(schema.enum)) {
        assert.strictEqual(
          typeof schema.type,
          'string',
          'Claude schema validation requires an enum to declare a scalar type'
        )
        for (const value of schema.enum) {
          assert.strictEqual(
            schema.type,
            value === null ? 'null' : typeof value
          )
        }
      }
      if (schema.type === 'object') {
        assert.ok(isRecord(schema.properties))
        assert.strictEqual(schema.additionalProperties, false)
        assert.deepEqual(schema.required, Object.keys(schema.properties))
        Object.values(schema.properties).forEach(check)
      } else if (schema.type === 'array') {
        check(schema.items)
      } else if (Array.isArray(schema.anyOf)) {
        schema.anyOf.forEach(check)
      }
    }
    for (const schema of [
      CopilotAssistedCommitResponseSchema,
      CopilotCommitMessageResponseSchema,
      CopilotConflictResolutionResponseSchema,
    ]) {
      assert.ok('type' in schema)
      assert.strictEqual(schema.type, 'object')
      assert.ok(!('anyOf' in schema) && !('oneOf' in schema))
      check(schema)
    }
  })

  it('describes every assisted outcome inside an object root without root unions', () => {
    const validate = ajv.compile(CopilotAssistedCommitResponseSchema)
    const plan = {
      ...wholeSelectionResponse(),
      commits: [
        {
          title: 'Update selected changes',
          description: '',
          changeIds: syntheticAnalysis.changes.map(change => change.id),
        },
      ],
    }
    for (const result of [
      plan,
      {
        kind: 'uncertain-boundaries',
        snapshotId: syntheticAnalysis.snapshotId,
        title: 'Update all selected changes',
        description: '',
      },
      {
        kind: 'unsafe',
        snapshotId: syntheticAnalysis.snapshotId,
        reason: 'Cannot safely describe selection',
      },
    ]) {
      assert.equal(validate({ result }), true, JSON.stringify(validate.errors))
      assert.deepEqual(
        parseCopilotAssistedCommitStructuredResponse(
          syntheticAnalysis,
          JSON.stringify({ result })
        ),
        result
      )
    }
    for (const malformed of [
      plan,
      { result: { ...plan, kind: 'unknown' } },
      { result: { ...plan, reason: 'extra field' } },
      { result: { ...plan, commits: [{ title: 'Missing IDs' }] } },
      { result: { ...plan, commits: 'not an array' } },
    ]) {
      assert.equal(validate(malformed), false)
    }
  })

  it('requires string commit-message fields while permitting an empty body', () => {
    const validate = ajv.compile(CopilotCommitMessageResponseSchema)
    assert.equal(validate({ title: 'Update feature', description: '' }), true)
    for (const malformed of [
      {},
      { title: 42, description: '' },
      { title: 'Update feature', description: null },
      { title: 'Update feature', description: '', extra: true },
    ]) {
      assert.equal(validate(malformed), false)
    }
  })

  it('describes text and delete/modify resolutions, ordered hunks and optional metadata', () => {
    const validate = ajv.compile(CopilotConflictResolutionResponseSchema)
    const text = {
      path: 'file.txt',
      hunks: [{ resolvedContent: 'first\n' }, { resolvedContent: 'second\n' }],
      reasoning: 'Combine both changes',
      action: null,
    }
    const response = {
      resolutions: [
        text,
        {
          path: 'deleted.txt',
          hunks: [],
          reasoning: 'Keep modified file',
          action: 'keep',
        },
      ],
      summary: null,
      references: [
        { type: 'pullRequest', id: '123' },
        { type: 'commit', id: 'abcd123' },
      ],
    }
    assert.equal(validate(response), true, JSON.stringify(validate.errors))
    for (const action of ['keep', 'delete', null]) {
      assert.equal(
        validate({
          ...response,
          resolutions: [{ ...text, action }],
        }),
        true,
        JSON.stringify(validate.errors)
      )
    }
    for (const malformed of [
      { ...response, resolutions: [{ ...text, action: 'overwrite' }] },
      { ...response, resolutions: [{ ...text, hunks: [42] }] },
      { ...response, resolutions: [{ ...text, path: 42 }] },
      { ...response, resolutions: [{ ...text, reasoning: null }] },
      { ...response, references: [{ type: 'url', id: 'external' }] },
    ]) {
      assert.equal(validate(malformed), false)
    }
    assert.deepEqual(
      parseCopilotConflictResolution(
        JSON.stringify({ resolutions: [text], summary: 42, references: null })
      ),
      {
        resolutions: [
          {
            path: text.path,
            hunks: text.hunks,
            reasoning: text.reasoning,
          },
        ],
        summary: null,
        references: [],
      }
    )
  })

  it('leaves semantic safety to application validators even for schema-valid output', () => {
    const validate = ajv.compile(CopilotAssistedCommitResponseSchema)
    for (const result of [
      {
        kind: 'plan',
        snapshotId: 'stale-snapshot',
        commits: [{ title: 'Update', description: '', changeIds: ['unknown'] }],
      },
      {
        kind: 'plan',
        snapshotId: syntheticAnalysis.snapshotId,
        commits: [{ title: 'Update', description: '', changeIds: [] }],
      },
    ]) {
      assert.equal(validate({ result }), true)
      assert.throws(
        () =>
          parseCopilotAssistedCommitStructuredResponse(
            syntheticAnalysis,
            JSON.stringify({ result })
          ),
        assertPlanningError('invalid-response')
      )
    }
    const parsed = parseCopilotConflictResolution(
      JSON.stringify({
        resolutions: [
          {
            path: '../unexpected.txt',
            hunks: [{ resolvedContent: 'resolved' }],
            reasoning: 'Combine changes',
            action: null,
          },
        ],
      })
    )
    assert.throws(
      () => validateResolutionPaths(parsed.resolutions, []),
      /unexpected file/
    )
  })

  it('requires the exact bare envelope and still rejects a split in whole-selection fallback', () => {
    const result = splitResponse()
    const content = JSON.stringify({ result })
    for (const malformed of [
      `\`\`\`json\n${content}\n\`\`\``,
      `Explanation\n${content}`,
      JSON.stringify(result),
      JSON.stringify({ result, ignored: true }),
    ]) {
      assert.throws(
        () =>
          parseCopilotAssistedCommitStructuredResponse(
            syntheticAnalysis,
            malformed
          ),
        assertPlanningError('invalid-response')
      )
    }
    assert.throws(
      () =>
        parseCopilotAssistedCommitStructuredResponse(
          syntheticAnalysis,
          content,
          'single-commit'
        ),
      /whole-selection message must describe one commit/
    )
  })
})
