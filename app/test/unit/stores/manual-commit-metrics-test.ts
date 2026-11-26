import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import * as dugite from 'dugite'

let harness: typeof import('../../helpers/assisted-commit-run')
let fixtures: typeof import('../../helpers/assisted-commit')
const commands: Array<ReadonlyArray<string>> = []

before(async () => {
  const exec = (...[args, path, options]: Parameters<typeof dugite.exec>) => {
    commands.push(args)
    return dugite.exec(args, path, options)
  }
  mock.module('dugite', { namedExports: { ...dugite, exec } })
  ;[harness, fixtures] = await Promise.all([
    import('../../helpers/assisted-commit-run'),
    import('../../helpers/assisted-commit'),
  ])
})

describe('Manual commit workflow metrics', () => {
  for (const pushAfterCommit of [false, true]) {
    it(`does not add a pre-commit status scan for telemetry (push=${pushAfterCommit})`, async t => {
      const source = await fixtures.seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setCommitMode(repository, 'manual')
      h.dispatcher.setPushAfterCommit(repository, pushAfterCommit)
      h.appStore['_refreshRepositoryAfterCommit'] = async () => {}
      const pushedBranches: Array<string | null> = []
      h.appStore['pushAfterCommit'] = async (_repository, branch) => {
        pushedBranches.push(branch)
      }
      commands.length = 0
      assert.strictEqual(
        await h.appStore._commitIncludedChanges(repository, {
          summary: 'Ordinary Manual fixture',
          description: '',
        }),
        true
      )
      const commitIndex = commands.findIndex(args => args.includes('commit'))
      assert.ok(commitIndex >= 0)
      const statusBeforeCommit = commands
        .slice(0, commitIndex)
        .filter(args => args.includes('status'))
      assert.strictEqual(statusBeforeCommit.length, pushAfterCommit ? 1 : 0)
      assert.strictEqual(pushedBranches.length, pushAfterCommit ? 1 : 0)
      assert.strictEqual((await h.measures()).manualCommitWorkflowCount, 1)
      assert.strictEqual(await fixtures.count(repository), 2)
    })
  }
})
