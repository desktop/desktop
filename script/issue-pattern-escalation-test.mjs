import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(
  '.github/workflows/issue-pattern-escalation.md',
  'utf8'
)
const match = source.match(/node <<'NODE'\n([\s\S]*?)\n\s*NODE/)
assert.ok(match, 'proposal guard must exist')
const guard = match[1]

function validate(output) {
  runInNewContext(guard, {
    require: name => {
      assert.equal(name, 'node:fs')
      return { readFileSync: () => JSON.stringify(output) }
    },
    process: { env: { AGENT_OUTPUT: 'fixture' } },
  })
}

describe('issue pattern proposal output guard', () => {
  const proposal = {
    type: 'create_issue',
    title: 'Core function unavailable',
    body: 'Evidence for a proposed escalation',
  }

  it('accepts a single proposal or a no-op', () => {
    assert.doesNotThrow(() => validate({ items: [proposal] }))
    assert.doesNotThrow(() =>
      validate({ items: [{ type: 'noop', message: 'No eligible pattern' }] })
    )
  })

  it('rejects duplicate proposals and malformed records', () => {
    assert.throws(() => validate({ items: [proposal, proposal] }))
    assert.throws(() => validate({ items: [{ ...proposal, body: null }] }))
    assert.throws(() => validate({}))
  })

  it('rejects additional labels, relationships, fields, and other outputs', () => {
    for (const extra of [
      { labels: ['invalid'] },
      { parent: 123 },
      { blocked_by: [123] },
      { fields: [{ name: 'Priority', value: 'P1' }] },
      { repo: 'other/repository' },
    ]) {
      assert.throws(() => validate({ items: [{ ...proposal, ...extra }] }))
    }
    assert.throws(() => validate({ items: [{ type: 'add_comment' }] }))
  })
})

describe('compiled issue pattern workflow', () => {
  const compiled = readFileSync(
    '.github/workflows/issue-pattern-escalation.lock.yml',
    'utf8'
  )

  it('only exposes proposal and no-op output handlers', () => {
    const configLine = compiled.match(
      /GH_AW_SAFE_OUTPUTS_HANDLER_CONFIG:\s*'([\s\S]*?)'/
    )
    assert.ok(configLine)
    const config = JSON.parse(configLine[1].replace(/\s*\n\s*/g, ' '))
    assert.deepEqual(Object.keys(config).sort(), ['create_issue', 'noop'])
    assert.equal(config.create_issue.max, 1)
    assert.deepEqual(config.create_issue.labels, ['priority-1'])
    assert.equal(config.noop['report-as-issue'], 'false')
  })

  it('validates proposals before processing and disables diagnostic issue writes', () => {
    const guardPosition = compiled.indexOf('name: Validate proposal output')
    const processPosition = compiled.indexOf('name: Process Safe Outputs')
    assert.ok(guardPosition >= 0)
    assert.ok(
      processPosition >= 0 && guardPosition < processPosition
    )
    assert.match(compiled, /GH_AW_FAILURE_REPORT_AS_ISSUE: 'false'/)
    assert.doesNotMatch(compiled, /handle_detection_runs\.cjs/)
    assert.doesNotMatch(compiled, /create_report_incomplete_issue/)
    assert.match(
      compiled,
      /GITHUB_MCP_SERVER_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/
    )
  })
})
