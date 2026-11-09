import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const fixture = JSON.parse(
  await readFile(new URL('./engine-expected.json', import.meta.url), 'utf8')
)
const code = await readFile(
  new URL('../../crates/core/src/repo_rules/re2js.js', import.meta.url),
  'utf8'
)
const sandbox = vm.createContext({})
vm.runInContext(code, sandbox, { timeout: 3000 })
assert.equal(typeof sandbox.TextEncoder, 'undefined')
assert.equal(typeof sandbox.TextDecoder, 'undefined')
assert.equal(typeof sandbox.process, 'undefined')
assert.equal(typeof sandbox.require, 'undefined')
for (const item of fixture.cases) {
  let actual
  try {
    const result = JSON.parse(
      sandbox.__desktopMatchRules(
        JSON.stringify([item.parameters]),
        item.branch
      )
    )
    assert.equal(result.length, 1)
    actual = { matched: result[0] }
  } catch (error) {
    actual = { status: 'error', name: error.name, message: error.message }
  }
  assert.deepEqual(actual, item.outcome, item.id)
}
assert.equal(sandbox.__desktopMatchRules('[]', 'branch'), '[]')
assert.equal(
  sandbox.__desktopMatchRules(
    JSON.stringify([
      { operator: 'starts_with', pattern: 'feature/', negate: false },
      { operator: 'unknown', pattern: 'ignored', negate: true },
    ]),
    'feature/topic'
  ),
  '[true,false]'
)
for (const invalid of [
  'null',
  '{}',
  '[null]',
  '[{"operator":"regex","pattern":"a","negate":"false"}]',
]) {
  assert.throws(() => sandbox.__desktopMatchRules(invalid, 'branch'))
}
process.stdout.write(
  `PASS: ${fixture.cases.length} embedded engine dialect cases without Node/browser globals.\n`
)
