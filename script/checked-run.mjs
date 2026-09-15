import { checkScope, runNode } from './type-check.mjs'

const [scope, file, ...args] = process.argv.slice(2)
if (scope === undefined || file === undefined) {
  throw new Error('Usage: checked-run.mjs <scope> <file> [arguments...]')
}

await checkScope(scope)
await runNode(['--import', 'tsx', file, ...args])
