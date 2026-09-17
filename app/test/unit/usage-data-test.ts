import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import { generateUsageDataExample } from '../helpers/usage-data'

describe('usage data example', () => {
  it('matches the request body sent by StatsStore', async () => {
    const examplePath = resolve('docs/process/usage-data.json')
    const checkedInExample = await readFile(examplePath, 'utf8')
    const generatedExample = generateUsageDataExample()
    const expected = `${JSON.stringify(generatedExample, null, 2)}\n`

    assert.strictEqual(
      checkedInExample.replaceAll('\r\n', '\n'),
      expected,
      'Usage data example is stale. Run `yarn generate-example-usage-data`.'
    )
  })
})
