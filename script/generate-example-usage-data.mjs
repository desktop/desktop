import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import usageData from '../app/test/helpers/usage-data.ts'

const outputPath = resolve('docs/process/usage-data.json')
const payload = usageData.generateUsageDataExample()

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outputPath}`)
